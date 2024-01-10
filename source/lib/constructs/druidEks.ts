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
import * as constants from '../utils/constants';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import * as eks from 'aws-cdk-lib/aws-eks';
import * as fs from 'fs';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as mustache from 'mustache';
import * as path from 'path';
import * as utils from '../utils/utils';

import { DruidEksBase, DruidEksBaseProps } from './druidEksBase';

import { Construct } from 'constructs';
import { EksNodeGroupConfig } from '../utils/types';

export class DruidEks extends DruidEksBase {
    public override readonly eksCluster: eks.Cluster;

    public constructor(scope: Construct, id: string, props: DruidEksBaseProps) {
        super(scope, id, props);
    }

    public override createEksCluster(): eks.ICluster {
        return new eks.Cluster(this, 'eks-cluster', {
            ...this.getCommonEksClusterParams(),
            defaultCapacity: 0,
        });
    }

    public override deployZookeeperHelmChart(helmChartProps: {
        cluster: cdk.aws_eks.ICluster;
        repository: string;
        chart: string;
        release: string;
    }): cdk.aws_eks.HelmChart {
        const nodeGroupConfig = this.props.eksClusterConfig
            .capacityProviderConfig as EksNodeGroupConfig;
        return new eks.HelmChart(this, 'zookeeper-chart', {
            ...helmChartProps,
            values: {
                replicaCount: nodeGroupConfig.zookeeper.minNodes,
                affinity: {
                    nodeAffinity: {
                        requiredDuringSchedulingIgnoredDuringExecution: {
                            nodeSelectorTerms: [
                                {
                                    matchExpressions: [
                                        {
                                            key: 'druid/nodeType',
                                            operator: 'In',
                                            values: ['zookeeper'],
                                        },
                                    ],
                                },
                            ],
                        },
                    },
                    podAntiAffinity: {
                        requiredDuringSchedulingIgnoredDuringExecution: [
                            {
                                labelSelector: {
                                    matchExpressions: [
                                        {
                                            key: 'app.kubernetes.io/component',
                                            operator: 'In',
                                            values: ['zookeeper'],
                                        },
                                    ],
                                },
                                topologyKey: 'kubernetes.io/hostname',
                            },
                        ],
                    },
                },
                persistence: {
                    enabled: false,
                },
            },
        });
    }

    public override deployDruid(
        druidOperatorChart: cdk.aws_eks.HelmChart,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        commonTemplateVariables: any
    ): void {
        const templateVariables = {
            ...commonTemplateVariables,
            // eslint-disable-next-line @typescript-eslint/naming-convention
            capacity_provider_ec2: true,
            // eslint-disable-next-line @typescript-eslint/naming-convention
            storage_class_name: 'ebs-sc',
        };

        // install ebs csi driver addon
        const addonName = 'aws-ebs-csi-driver';

        const serviceAccount = this.eksCluster.addServiceAccount(
            'ebs-csi-controller-sa',
            {
                name: 'ebs-csi-controller-sa',
                namespace: 'kube-system',
            }
        );

        serviceAccount.role.addManagedPolicy(
            iam.ManagedPolicy.fromAwsManagedPolicyName(
                'service-role/AmazonEBSCSIDriverPolicy'
            )
        );

        const cfnAddon = new eks.CfnAddon(this.eksCluster.stack, `${addonName}-addon`, {
            addonName,
            clusterName: this.eksCluster.clusterName,
            serviceAccountRoleArn: serviceAccount.role.roleArn,
            resolveConflicts: 'OVERWRITE',
        });

        cfnAddon.node.addDependency(serviceAccount);

        this.eksCluster.addManifest('storage-class', {
            apiVersion: 'storage.k8s.io/v1',
            kind: 'StorageClass',
            metadata: {
                name: 'ebs-sc',
            },
            provisioner: 'ebs.csi.aws.com',
            volumeBindingMode: 'WaitForFirstConsumer',
            parameters: {
                type: 'gp2',
                encrypted: 'true',
            },
        });

        // install cloudwatch agent
        // Refer to https://docs.aws.amazon.com/AmazonCloudWatch/latest/monitoring/Container-Insights-setup-EKS-quickstart.html
        const cwNameSpace = 'amazon-cloudwatch';
        const namespaceManifestResource = this.eksCluster.addManifest(
            'cloudwatch-namespace',
            {
                apiVersion: 'v1',
                kind: 'Namespace',
                metadata: {
                    name: cwNameSpace,
                    labels: {
                        name: cwNameSpace,
                    },
                },
            }
        );

        // create service account for cloudwatch agent
        const cwServiceAccount = this.eksCluster.addServiceAccount(
            'cloudwatch-agent-sa',
            {
                name: 'cloudwatch-agent',
                namespace: cwNameSpace,
            }
        );

        cwServiceAccount.role.addManagedPolicy(
            iam.ManagedPolicy.fromAwsManagedPolicyName('CloudWatchAgentServerPolicy')
        );

        cwServiceAccount.node.addDependency(namespaceManifestResource);

        // create service account for fluent bit
        const fluentBitServiceAccount = this.eksCluster.addServiceAccount(
            'fluent-bit-sa',
            {
                name: 'fluent-bit',
                namespace: cwNameSpace,
            }
        );

        fluentBitServiceAccount.role.addManagedPolicy(
            iam.ManagedPolicy.fromAwsManagedPolicyName('CloudWatchAgentServerPolicy')
        );

        fluentBitServiceAccount.node.addDependency(namespaceManifestResource);

        const cwAgentManifest = mustache.render(
            fs.readFileSync(
                path.resolve(
                    __dirname,
                    '../k8s-manifests/cwagent-fluent-bit-quickstart.yaml'
                ),
                'utf8'
            ),
            {
                /* eslint-disable @typescript-eslint/naming-convention */
                cluster_name: this.eksCluster.clusterName,
                druid_cluster_name: this.props.druidClusterParams.druidClusterName,
                region_name: cdk.Stack.of(this).region,
                http_server_port: '2020',
                http_server_toggle: 'On',
                read_from_head: 'Off',
                read_from_tail: 'On',
                /* eslint-enable */
            }
        );
        const cwManifestResources = utils.loadClusterManifest(
            'cloudwatch-agent-manifest',
            cwAgentManifest,
            this.eksCluster
        );
        cwManifestResources.forEach((r) => {
            r.node.addDependency(namespaceManifestResource);
        });

        // provision node group
        const nodeGroupConfig = this.props.eksClusterConfig
            .capacityProviderConfig as EksNodeGroupConfig;

        // only create managed node group when minSize is greater than 0, this allows
        // to maintain 0 instance for standby clusters
        if (nodeGroupConfig.zookeeper.minNodes > 0) {
            const zkNodeGroup = this.eksCluster.addNodegroupCapacity(
                'zookeeper-node-group',
                {
                    instanceTypes: [
                        new ec2.InstanceType(nodeGroupConfig.zookeeper.instanceType),
                    ],
                    minSize: nodeGroupConfig.zookeeper.minNodes,
                    maxSize: nodeGroupConfig.zookeeper.maxNodes,
                    diskSize:
                        nodeGroupConfig.zookeeper.rootVolumeSize ??
                        constants.DEFAULT_ROOT_VOLUME_SIZE,
                    labels: {
                        // eslint-disable-next-line @typescript-eslint/naming-convention
                        'druid/nodeType': 'zookeeper',
                    },
                }
            );
            zkNodeGroup.role.addManagedPolicy(
                iam.ManagedPolicy.fromAwsManagedPolicyName('AmazonSSMManagedInstanceCore')
            );
        }

        const [middleManagerTiers, historicalTiers, dataNodeGroupTiers] =
            this.createDataTiers(nodeGroupConfig);

        let queryNodeGroup: eks.Nodegroup | undefined;
        if (nodeGroupConfig.query.minNodes > 0) {
            queryNodeGroup = this.eksCluster.addNodegroupCapacity('query-node-group', {
                instanceTypes: [new ec2.InstanceType(nodeGroupConfig.query.instanceType)],
                minSize: nodeGroupConfig.query.minNodes,
                maxSize: nodeGroupConfig.query.maxNodes,
                diskSize:
                    nodeGroupConfig.query.rootVolumeSize ??
                    constants.DEFAULT_ROOT_VOLUME_SIZE,
                labels: {
                    // eslint-disable-next-line @typescript-eslint/naming-convention
                    'druid/nodeType': 'druid-query',
                },
            });
            queryNodeGroup.role.addManagedPolicy(
                iam.ManagedPolicy.fromAwsManagedPolicyName('AmazonSSMManagedInstanceCore')
            );
            if (dataNodeGroupTiers.length > 0) {
                queryNodeGroup.node.addDependency(
                    dataNodeGroupTiers[dataNodeGroupTiers.length - 1]
                );
            }
        }

        let masterNodeGroup: eks.Nodegroup | undefined;
        if (nodeGroupConfig.master.minNodes > 0) {
            masterNodeGroup = this.eksCluster.addNodegroupCapacity('master-node-group', {
                instanceTypes: [
                    new ec2.InstanceType(nodeGroupConfig.master.instanceType),
                ],
                minSize: nodeGroupConfig.master.minNodes,
                maxSize: nodeGroupConfig.master.maxNodes,
                diskSize:
                    nodeGroupConfig.master.rootVolumeSize ??
                    constants.DEFAULT_ROOT_VOLUME_SIZE,
                labels: {
                    // eslint-disable-next-line @typescript-eslint/naming-convention
                    'druid/nodeType': 'druid-master',
                },
            });
            masterNodeGroup.role.addManagedPolicy(
                iam.ManagedPolicy.fromAwsManagedPolicyName('AmazonSSMManagedInstanceCore')
            );
            if (queryNodeGroup) {
                masterNodeGroup.node.addDependency(queryNodeGroup);
            }
            druidOperatorChart.node.addDependency(masterNodeGroup);
        }

        // deploy the chart
        const zookeeperReplicaCnt = nodeGroupConfig.zookeeper.minNodes;
        const coordinatorReplicaCnt = nodeGroupConfig.master.minNodes;
        const overlordReplicaCnt = nodeGroupConfig.master.minNodes;
        const routerReplicaCnt = nodeGroupConfig.query.minNodes;
        const brokerReplicaCnt = nodeGroupConfig.query.minNodes;

        const zookeeperHosts = [];
        for (let i = 0; i < zookeeperReplicaCnt; i++) {
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

                middle_manager_tiers: middleManagerTiers,
                historical_tiers: historicalTiers,

                // template variables for coordinator
                coordinator_replica_cnt: coordinatorReplicaCnt,
                coordinator_request_cpu: constants.EKS_DEFAULT_REQUEST_CPU,
                coordinator_request_memory: constants.EKS_DEFAULT_REQUEST_MEMORY,
                coordinator_processor_count: Math.ceil(
                    utils.getInstanceTypeInfo(nodeGroupConfig.master.instanceType).cpu / 2
                ),
                coordinator_min_ram_percentage: 25.0,
                coordinator_max_ram_percentage: 50.0,
                coordinator_runtime_properties: this.mergeRuntimeProperties(
                    constants.COORDINATOR_RUNTIME_PROPERTIES,
                    nodeGroupConfig.master.runtimeConfig?.coordinator
                ),

                // template variables for coordinator
                overlord_replica_cnt: overlordReplicaCnt,
                overlord_request_cpu: constants.EKS_DEFAULT_REQUEST_CPU,
                overlord_request_memory: constants.EKS_DEFAULT_REQUEST_MEMORY,
                overlord_processor_count: Math.ceil(
                    utils.getInstanceTypeInfo(nodeGroupConfig.master.instanceType).cpu / 2
                ),
                overlord_min_ram_percentage: 25.0,
                overlord_max_ram_percentage: 50.0,
                overlord_runtime_properties: this.mergeRuntimeProperties(
                    constants.OVERLORD_RUNTIME_PROPERTIES,
                    nodeGroupConfig.master.runtimeConfig?.overlord
                ),

                // template variables for router
                router_replica_cnt: routerReplicaCnt,
                router_request_cpu: constants.EKS_DEFAULT_REQUEST_CPU,
                router_request_memory: constants.EKS_DEFAULT_REQUEST_MEMORY,
                router_processor_count: Math.ceil(
                    utils.getInstanceTypeInfo(nodeGroupConfig.query.instanceType).cpu / 2
                ),
                router_min_ram_percentage: 25.0,
                router_max_ram_percentage: 50.0,
                router_runtime_properties: this.mergeRuntimeProperties(
                    constants.ROUTER_RUNTIME_PROPERTIES,
                    nodeGroupConfig.query.runtimeConfig?.router
                ),

                // template variables for broker
                broker_replica_cnt: brokerReplicaCnt,
                broker_request_cpu: constants.EKS_DEFAULT_REQUEST_CPU,
                broker_request_memory: constants.EKS_DEFAULT_REQUEST_MEMORY,
                broker_processor_count: Math.ceil(
                    utils.getInstanceTypeInfo(nodeGroupConfig.query.instanceType).cpu / 2
                ),
                broker_min_ram_percentage: 25.0,
                broker_max_ram_percentage: 50.0,
                broker_runtime_properties: this.mergeRuntimeProperties(
                    constants.BROKER_RUNTIME_PROPERTIES,
                    nodeGroupConfig.query.runtimeConfig?.broker
                ),
                /* eslint-enable @typescript-eslint/naming-convention */
            }
        );

        const manifestResources = utils.loadClusterManifest(
            'druid-cluster-manifest',
            druidClusterManifest,
            this.eksCluster
        );

        manifestResources.forEach((r) => {
            r.node.addDependency(druidOperatorChart);
        });
    }

    private getCommonDataNodeProps(
        nodeGroupConfig: EksNodeGroupConfig,
        nodeType: string,
        serviceTier: string
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ): any {
        return {
            /* eslint-disable @typescript-eslint/naming-convention */
            service_tier: serviceTier,
            node_group_label:
                serviceTier === constants.DEFAULT_TIER
                    ? `druid-data`
                    : `druid-data-${serviceTier}`,
            replica_cnt: nodeGroupConfig[nodeType].minNodes,
            request_cpu: constants.EKS_DEFAULT_REQUEST_CPU,
            request_memory: constants.EKS_DEFAULT_REQUEST_MEMORY,
            processor_count: Math.ceil(
                utils.getInstanceTypeInfo(nodeGroupConfig[nodeType].instanceType).cpu / 2
            ),
            min_ram_percentage: 25.0,
            max_ram_percentage: 50.0,
            /* eslint-enable @typescript-eslint/naming-convention */
        };
    }

    private createMiddleManagerTier(
        nodeGroupConfig: EksNodeGroupConfig,
        nodeType: string,
        serviceTier: string
    ): unknown {
        return {
            ...this.getCommonDataNodeProps(nodeGroupConfig, nodeType, serviceTier),
            /* eslint-disable @typescript-eslint/naming-convention */
            node_group_name:
                serviceTier === constants.DEFAULT_TIER
                    ? 'middlemanagers'
                    : `middlemanagers-${serviceTier}`,
            worker_category:
                serviceTier === constants.DEFAULT_TIER
                    ? '_default_worker_category'
                    : serviceTier,
            task_cache_volume_size:
                nodeGroupConfig[nodeType].taskCacheVolumeSize ??
                constants.DRUID_TASK_VOLUME_SIZE,
            runtime_properties: this.mergeRuntimeProperties(
                constants.MIDDLEMANAGER_RUNTIME_PROPERTIES,
                nodeGroupConfig[nodeType].runtimeConfig?.middleManager
            ),
            /* eslint-enable @typescript-eslint/naming-convention */
        };
    }

    private createHistoricalTier(
        nodeGroupConfig: EksNodeGroupConfig,
        nodeType: string,
        serviceTier: string
    ): unknown {
        return {
            ...this.getCommonDataNodeProps(nodeGroupConfig, nodeType, serviceTier),
            /* eslint-disable @typescript-eslint/naming-convention */
            node_group_name:
                serviceTier === constants.DEFAULT_TIER
                    ? 'historicals'
                    : `historicals-${serviceTier}`,
            segment_cache_volume_size:
                nodeGroupConfig[nodeType].segmentCacheVolumeSize ||
                constants.DRUID_SEGMENT_VOLUME_SIZE,
            runtime_properties: this.mergeRuntimeProperties(
                constants.HISTORICAL_RUNTIME_PROPERTIES,
                nodeGroupConfig[nodeType].runtimeConfig?.historical
            ),
            /* eslint-enable @typescript-eslint/naming-convention */
        };
    }

    private createDataTiers(
        nodeGroupConfig: EksNodeGroupConfig
    ): [unknown[], unknown[], eks.Nodegroup[]] {
        const middleManagerTiers: unknown[] = [];
        const historicalTiers: unknown[] = [];
        const dataNodeGroupTiers: eks.Nodegroup[] = [];

        Object.keys(nodeGroupConfig).forEach((nodeType) => {
            // match text against data or data_<tier>
            const matchResult = nodeType.match(/^data(\w*)$/);
            if (matchResult && nodeGroupConfig[nodeType].minNodes > 0) {
                const serviceTier = matchResult[1]
                    ? matchResult[1].substring(1)
                    : constants.DEFAULT_TIER;

                middleManagerTiers.push(
                    this.createMiddleManagerTier(nodeGroupConfig, nodeType, serviceTier)
                );
                historicalTiers.push(
                    this.createHistoricalTier(nodeGroupConfig, nodeType, serviceTier)
                );
                const dataNodeGroups = this.createDataNodeGroup(
                    nodeGroupConfig,
                    nodeType,
                    serviceTier
                );
                if (dataNodeGroupTiers.length > 0 && dataNodeGroups.length > 0) {
                    dataNodeGroups[0].node.addDependency(
                        dataNodeGroupTiers[dataNodeGroupTiers.length - 1]
                    );
                }
                dataNodeGroupTiers.push(...dataNodeGroups);
            }
        });

        return [middleManagerTiers, historicalTiers, dataNodeGroupTiers];
    }

    private createDataNodeGroup(
        nodeGroupConfig: EksNodeGroupConfig,
        nodeType: string,
        serviceTier: string
    ): eks.Nodegroup[] {
        const dataNodeGroups: eks.Nodegroup[] = [];

        if (nodeGroupConfig[nodeType].minNodes > 0) {
            const availabilityZones = this.props.baseInfra.vpc.availabilityZones;
            const availabilityZoneCnt = availabilityZones.length;

            if (nodeGroupConfig[nodeType].minNodes % availabilityZoneCnt > 0) {
                throw new Error(
                    `The number of ${nodeType} nodes must be a multiple of Availability Zones (${availabilityZoneCnt}).`
                );
            }
            const minSizePerAz = nodeGroupConfig[nodeType].minNodes / availabilityZoneCnt;

            availabilityZones.forEach((availabilityZone) => {
                const dataNodeGroup = this.eksCluster.addNodegroupCapacity(
                    `${nodeType}-node-group-${availabilityZone}`,
                    {
                        instanceTypes: [
                            new ec2.InstanceType(nodeGroupConfig[nodeType].instanceType),
                        ],
                        minSize: minSizePerAz,
                        maxSize: nodeGroupConfig[nodeType].maxNodes
                            ? Math.round(
                                  // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
                                  nodeGroupConfig[nodeType].maxNodes! /
                                      availabilityZoneCnt
                              )
                            : undefined,
                        diskSize:
                            nodeGroupConfig[nodeType].rootVolumeSize ??
                            constants.DEFAULT_ROOT_VOLUME_SIZE,
                        subnets: {
                            availabilityZones: [availabilityZone],
                        },
                        labels: {
                            // eslint-disable-next-line @typescript-eslint/naming-convention
                            'druid/nodeType':
                                serviceTier === constants.DEFAULT_TIER
                                    ? 'druid-data'
                                    : `druid-data-${serviceTier}`,
                        },
                    }
                );
                dataNodeGroup.role.addManagedPolicy(
                    iam.ManagedPolicy.fromAwsManagedPolicyName(
                        'AmazonSSMManagedInstanceCore'
                    )
                );
                if (dataNodeGroups.length > 0) {
                    dataNodeGroup.node.addDependency(
                        dataNodeGroups[dataNodeGroups.length - 1]
                    );
                }
                dataNodeGroups.push(dataNodeGroup);
            });
        }
        return dataNodeGroups;
    }
}
