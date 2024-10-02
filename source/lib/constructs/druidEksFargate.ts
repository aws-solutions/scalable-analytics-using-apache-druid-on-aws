/* 
  Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
  
  Licensed under the Apache License, Version 2.0 (the "License").
  You may not use this file except in compliance with the License.
  You may obtain a copy of the License at
  
      http://www.apache.org/licenses/LICENSE-2.0
  
  Unless required by applicable law or agreed to in writing, software
  distributed under the License is distributed on an "AS IS" BASIS,
  WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
  See the License for the specific language governing permissions and
  limitations under the License.
*/
import * as cdk from 'aws-cdk-lib';
import * as eks from 'aws-cdk-lib/aws-eks';
import * as fs from 'fs';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as mustache from 'mustache';
import * as path from 'path';
import * as utils from '../utils/utils';
import * as efs from 'aws-cdk-lib/aws-efs';
import { DruidEksBase, DruidEksBaseProps } from './druidEksBase';

import { Construct } from 'constructs';
import { DruidProcessType, EksFargateConfig } from '../utils/types';
import { AuroraServerlessMetadataStore } from './auroraServerlessMetadataStore';
import * as constants from '../utils/constants';

export class DruidEksFargate extends DruidEksBase {
    public override readonly eksCluster: eks.FargateCluster;

    public constructor(scope: Construct, id: string, props: DruidEksBaseProps) {
        super(scope, id, props);
    }

    public override createEksCluster(): eks.ICluster {
        const cluster = new eks.FargateCluster(this, 'eks-cluster', {
            ...this.getCommonEksClusterParams(),
        });

        // setup logging
        // Refer to https://docs.aws.amazon.com/eks/latest/userguide/fargate-logging.html
        cluster.defaultProfile.podExecutionRole.addManagedPolicy(
            iam.ManagedPolicy.fromAwsManagedPolicyName('CloudWatchAgentServerPolicy')
        );

        const loggingNamespace = 'aws-observability';
        const loggingNamespaceResource = cluster.addManifest(`${loggingNamespace}-ns`, {
            kind: 'Namespace',
            apiVersion: 'v1',
            metadata: {
                name: loggingNamespace,
                labels: {
                    // eslint-disable-next-line @typescript-eslint/naming-convention
                    'aws-observability': 'enabled',
                },
            },
        });

        const loggingManifest = mustache.render(
            fs.readFileSync(
                path.resolve(
                    __dirname,
                    '../k8s-manifests/aws-logging-cloudwatch-configmap.yaml'
                ),
                'utf8'
            ),
            {
                /* eslint-disable @typescript-eslint/naming-convention */
                druid_cluster_name: this.props.druidClusterParams.druidClusterName,
                region_name: cdk.Stack.of(this).region,
                /* eslint-enable */
            }
        );
        const loggingManifestResources = utils.loadClusterManifest(
            'logging-manifest',
            loggingManifest,
            cluster
        );
        loggingManifestResources.forEach((r) => {
            r.node.addDependency(loggingNamespaceResource);
        });

        return cluster;
    }

    public override deployZookeeperHelmChart(helmChartProps: {
        cluster: cdk.aws_eks.ICluster;
        repository: string;
        chart: string;
        release: string;
    }): cdk.aws_eks.HelmChart {
        const fargateConfig = this.props.eksClusterConfig
            .capacityProviderConfig as EksFargateConfig;
        return new eks.HelmChart(this, 'zookeeper-chart', {
            ...helmChartProps,
            values: {
                replicaCount: fargateConfig.zookeeper.minNodes,
                resources: {
                    requests: {
                        cpu: fargateConfig.zookeeper.cpu,
                        memory: fargateConfig.zookeeper.memory,
                    },
                },
                persistence: {
                    enabled: false,
                },
            },
        });
    }

    protected override createDruidSecrets(
        rdsMetadataConstruct: AuroraServerlessMetadataStore
    ): void {
        this.eksCluster.addFargateProfile(`external-secrets-profile`, {
            selectors: [{ namespace: 'external-secrets' }],
        });

        super.createDruidSecrets(rdsMetadataConstruct);
    }

    public override deployDruid(
        druidOperatorChart: cdk.aws_eks.HelmChart,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        commonTemplateVariables: any
    ): void {
        const templateVariables = {
            ...commonTemplateVariables,
            // eslint-disable-next-line @typescript-eslint/naming-convention
            capacity_provider_ec2: false,
            // eslint-disable-next-line @typescript-eslint/naming-convention
            storage_class_name: 'efs-sc',
        };

        const fargateConfig = this.props.eksClusterConfig
            .capacityProviderConfig as EksFargateConfig;

        const [middleManagerTiers, historicalTiers] = this.createDataTiers(fargateConfig);

        const zookeeperHosts = [];
        for (let i = 0; i < fargateConfig.zookeeper.minNodes; i++) {
            zookeeperHosts.push(
                `zookeeper-${i}.zookeeper-headless.default.svc.cluster.local`
            );
        }

        // set up druid cluster
        const druidClusterManifest = mustache.render(
            fs.readFileSync(
                path.resolve(__dirname, '../k8s-manifests/druid-cluster-eks.yaml'),
                'utf8'
            ),
            {
                /* eslint-disable @typescript-eslint/naming-convention */
                ...templateVariables,
                zookeeper_hosts: zookeeperHosts.join(','),

                // template variables for segment cache
                middle_manager_tiers: middleManagerTiers,
                historical_tiers: historicalTiers,

                // template variables for coordinator
                coordinator_replica_cnt: fargateConfig.coordinator.minNodes,
                coordinator_request_cpu: fargateConfig.coordinator.cpu,
                coordinator_request_memory: fargateConfig.coordinator.memory,
                coordinator_processor_count: fargateConfig.coordinator.cpu,
                coordinator_min_ram_percentage: 25.0,
                coordinator_max_ram_percentage: 90.0,
                coordinator_runtime_properties: this.mergeRuntimeProperties(
                    constants.COORDINATOR_RUNTIME_PROPERTIES,
                    fargateConfig.coordinator.runtimeConfig
                ),

                // template variables for overlord
                overlord_replica_cnt: fargateConfig.overlord.minNodes,
                overlord_request_cpu: fargateConfig.overlord.cpu,
                overlord_request_memory: fargateConfig.overlord.memory,
                overlord_processor_count: fargateConfig.overlord.cpu,
                overlord_min_ram_percentage: 25.0,
                overlord_max_ram_percentage: 90.0,
                overlord_runtime_properties: this.mergeRuntimeProperties(
                    constants.OVERLORD_RUNTIME_PROPERTIES,
                    fargateConfig.overlord.runtimeConfig
                ),

                // template variables for router
                router_replica_cnt: fargateConfig.router.minNodes,
                router_request_cpu: fargateConfig.router.cpu,
                router_request_memory: fargateConfig.router.memory,
                router_processor_count: fargateConfig.router.cpu,
                router_min_ram_percentage: 25.0,
                router_max_ram_percentage: 90.0,
                router_runtime_properties: this.mergeRuntimeProperties(
                    constants.ROUTER_RUNTIME_PROPERTIES,
                    fargateConfig.router.runtimeConfig
                ),

                // template variables for broker
                broker_replica_cnt: fargateConfig.broker.minNodes,
                broker_request_cpu: fargateConfig.broker.cpu,
                broker_request_memory: fargateConfig.broker.memory,
                broker_processor_count: fargateConfig.broker.cpu,
                broker_min_ram_percentage: 25.0,
                broker_max_ram_percentage: 90.0,
                broker_runtime_properties: this.mergeRuntimeProperties(
                    constants.BROKER_RUNTIME_PROPERTIES,
                    fargateConfig.broker.runtimeConfig
                ),
                /* eslint-enable @typescript-eslint/naming-convention */
            }
        );

        const manifestResources = utils.loadClusterManifest(
            'druid-cluster-fargate-manifest',
            druidClusterManifest,
            this.eksCluster
        );
        manifestResources.forEach((r) => {
            r.node.addDependency(druidOperatorChart);
        });
    }

    private createEfsFileSystem(): efs.FileSystem {
        const efsFileSystem = new efs.FileSystem(this, 'druid-efs-filesystem', {
            vpc: this.eksCluster.vpc,
            enableAutomaticBackups: true,
            encrypted: true,
            performanceMode: efs.PerformanceMode.GENERAL_PURPOSE,
            vpcSubnets: {
                subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS,
            },
            removalPolicy: this.props.removalPolicy,
        });

        efsFileSystem.connections.allowDefaultPortFrom(
            this.eksCluster.clusterSecurityGroup
        );

        // configure storage class for efs
        this.eksCluster.addManifest('efs-storage-manifest', {
            kind: 'StorageClass',
            apiVersion: 'storage.k8s.io/v1',
            metadata: {
                name: 'efs-sc',
            },
            provisioner: 'efs.csi.aws.com',
        });

        return efsFileSystem;
    }

    private createEfsVolume(
        replicaCnt: number,
        druidClusterName: string,
        volumePrefix: string,
        volumeSize: number,
        efsFileSystem: efs.FileSystem,
        serviceTier: string
    ): void {
        for (let i = 0; i < replicaCnt; i++) {
            const volumeName =
                serviceTier === constants.DEFAULT_TIER
                    ? `${druidClusterName}-${volumePrefix}-${i}`
                    : `${druidClusterName}-${volumePrefix}-${serviceTier}-${i}`;
            const efsAccessPoint = efsFileSystem.addAccessPoint(
                `druid-efs-ap-${volumeName}`,
                {
                    path: `/${volumeName}`,
                    createAcl: {
                        ownerGid: '1000',
                        ownerUid: '1000',
                        permissions: '777',
                    },
                    posixUser: {
                        uid: '1000',
                        gid: '1000',
                    },
                }
            );
            this.eksCluster.addManifest(`druid-efs-${volumeName}-pv`, {
                apiVersion: 'v1',
                kind: 'PersistentVolume',
                metadata: {
                    name: `druid-efs-${volumeName}-pv`,
                },
                spec: {
                    capacity: {
                        storage: `${volumeSize}Gi`,
                    },
                    volumeMode: 'Filesystem',
                    accessModes: ['ReadWriteOnce'],
                    persistentVolumeReclaimPolicy: 'Retain',
                    claimRef: {
                        name: `data-volume-druid-${volumeName}`,
                        namespace: 'default',
                    },
                    storageClassName: 'efs-sc',
                    csi: {
                        driver: 'efs.csi.aws.com',
                        volumeHandle: `${efsFileSystem.fileSystemId}::${efsAccessPoint.accessPointId}`,
                    },
                },
            });
        }
    }

    private createDataTiers(fargateConfig: EksFargateConfig): [unknown[], unknown[]] {
        const middleManagerTiers: unknown[] = [];
        const historicalTiers: unknown[] = [];

        // create efs volumes for historicals and middlemanagers
        const efsFileSystem = this.createEfsFileSystem();

        Object.keys(fargateConfig).forEach((processType) => {
            // match text against data or data_<tier>
            const matchResult = processType.match(/^(historical|middleManager)(\w*)$/);
            if (matchResult && fargateConfig[processType].minNodes > 0) {
                const serviceTier = matchResult[2]
                    ? matchResult[2].substring(1)
                    : constants.DEFAULT_TIER;

                const commonProps = {
                    /* eslint-disable @typescript-eslint/naming-convention */
                    service_tier: serviceTier,
                    replica_cnt: fargateConfig[processType].minNodes,
                    request_cpu: fargateConfig[processType].cpu,
                    request_memory: fargateConfig[processType].memory,
                    processor_count: fargateConfig[processType].cpu,
                    min_ram_percentage: 25.0,
                    max_ram_percentage: 90.0,
                    /* eslint-enable @typescript-eslint/naming-convention */
                };

                switch (matchResult[1]) {
                    case DruidProcessType.MIDDLE_MANAGER:
                        middleManagerTiers.push({
                            /* eslint-disable @typescript-eslint/naming-convention */
                            ...commonProps,
                            node_group_name:
                                serviceTier === constants.DEFAULT_TIER
                                    ? 'middlemanagers'
                                    : `middlemanagers-${serviceTier}`,
                            worker_category:
                                serviceTier === constants.DEFAULT_TIER
                                    ? '_default_worker_category'
                                    : serviceTier,
                            task_cache_volume_size: utils.ifUndefined(
                                fargateConfig[processType].taskCacheVolumeSize,
                                constants.DRUID_TASK_VOLUME_SIZE
                            ),
                            runtime_properties: this.mergeRuntimeProperties(
                                constants.MIDDLEMANAGER_RUNTIME_PROPERTIES,
                                fargateConfig[processType].runtimeConfig
                            ),
                            /* eslint-enable @typescript-eslint/naming-convention */
                        });

                        this.createEfsVolume(
                            fargateConfig.middleManager.minNodes,
                            this.props.druidClusterParams.druidClusterName,
                            'middlemanagers',
                            utils.ifUndefined(
                                fargateConfig[processType].taskCacheVolumeSize,
                                constants.DRUID_TASK_VOLUME_SIZE
                            ),
                            efsFileSystem,
                            serviceTier
                        );
                        break;

                    case DruidProcessType.HISTORICAL:
                    default:
                        historicalTiers.push({
                            ...commonProps,
                            /* eslint-disable @typescript-eslint/naming-convention */
                            node_group_name:
                                serviceTier === constants.DEFAULT_TIER
                                    ? 'historicals'
                                    : `historicals-${serviceTier}`,
                            segment_cache_volume_size: utils.ifUndefined(
                                fargateConfig[processType].segmentCacheVolumeSize,
                                constants.DRUID_SEGMENT_VOLUME_SIZE
                            ),
                            runtime_properties: this.mergeRuntimeProperties(
                                constants.HISTORICAL_RUNTIME_PROPERTIES,
                                fargateConfig[processType].runtimeConfig
                            ),
                            /* eslint-enable @typescript-eslint/naming-convention */
                        });
                        this.createEfsVolume(
                            fargateConfig.historical.minNodes,
                            this.props.druidClusterParams.druidClusterName,
                            'historicals',
                            utils.ifUndefined(
                                fargateConfig[processType].segmentCacheVolumeSize,
                                constants.DRUID_SEGMENT_VOLUME_SIZE
                            ),
                            efsFileSystem,
                            serviceTier
                        );
                        break;
                }
            }
        });

        return [middleManagerTiers, historicalTiers];
    }
}
