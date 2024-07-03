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
import * as cw from 'aws-cdk-lib/aws-cloudwatch';

import { DruidEksBase, DruidEksBaseProps } from '../constructs/druidEksBase';
import {
    DruidProcessType,
    DruidStackProps,
    EksCapacityProviderType,
    EksConfig,
} from '../utils/types';
import {
    MonitoringDashboard,
    commonGraphWidgetProps,
} from '../constructs/monitoringDashboard';

import { CfnNagResourcePathRulesSuppressionAspect } from '../constructs/cfnNagSuppression';
import { DruidEks } from '../constructs/druidEks';
import { DruidEksFargate } from '../constructs/druidEksFargate';
import { DruidStack } from './druidStack';
import { LoadBalancerControllerCleanup } from '../constructs/loadBalancerControllerCleanup';
import { OperationalMetricsCollection } from '../constructs/operationalMetricCollection';
import { DruidAlarms, commonAlarmProps } from '../constructs/druidAlarm';
import { mapProcessTypeToNodeType } from '../utils/utils';

export class DruidEksStack extends DruidStack {
    protected readonly commonMetricProps = {
        namespace: 'ContainerInsights',
        statistic: cw.Stats.AVERAGE,
    };

    protected readonly cluster: DruidEksBase;
    public constructor(scope: cdk.App, id: string, props: DruidStackProps) {
        super(scope, id, props);

        if (props.clusterParams.druidRetentionRules) {
            throw new Error(
                'Provisioning retention rules via CDK is not supported on EKS deployment platform. ' +
                    'Please configure retention rules via Druid web console or Druid API.'
            );
        }

        if (props.clusterParams.oidcIdpConfig?.groupRoleMappings) {
            throw new Error(
                'Provisioning group roles mappings via CDK is not supported on EKS deployment platform. ' +
                    'Please configure the roles and group mappings via Druid API.'
            );
        }

        const eksClusterConfig = props.clusterParams.hostingConfig as EksConfig;

        const druidEksProps: DruidEksBaseProps = {
            baseInfra: this.baseInfra,
            acmCertificate: this.certificate,
            route53Params: props.route53Params,
            druidDomain: props.druidDomain,
            eksClusterConfig,
            druidClusterParams: props.clusterParams,
            enableFipsEndpoints: props.clusterParams.enableFipsEndpoints,
            removalPolicy: props.removalPolicy,
            webAclArn: this.webAcl?.attrArn,
            solutionVersion: props.solutionVersion,
            solutionTags: props.solutionTags,
        };

        this.cluster =
            eksClusterConfig.capacityProviderType === EksCapacityProviderType.EC2
                ? new DruidEks(this, 'druid-eks-cluster', druidEksProps)
                : new DruidEksFargate(this, 'druid-eks-cluster', druidEksProps);

        if (props.druidDomain) {
            this.createCanary(`https://${props.druidDomain}`);
        }

        // using prettier-ignore prevents prettier from reformatting the nosonar line to the next line
        // prettier-ignore
        new OperationalMetricsCollection(this, 'metrics-collection', { // NOSONAR (typescript:S1848) - cdk construct is used
            vpc: this.baseInfra.vpc,
            awsSolutionId: props.solutionId,
            awsSolutionVersion: props.solutionVersion,
            druidVersion: props.clusterParams.druidVersion,
            hostingPlatform:
                eksClusterConfig.capacityProviderType === EksCapacityProviderType.EC2
                    ? 'EKS'
                    : 'EKS-Fargate',
            internetFacing: props.clusterParams.internetFacing ?? false,
            retainData: props.removalPolicy === cdk.RemovalPolicy.RETAIN,
        });

        const loadBalancerControllerCleanup = new LoadBalancerControllerCleanup(
            this,
            'clean-up',
            {
                eksClusterId: this.cluster.eksCluster.clusterName,
                druidDomain: props.druidDomain,
                hostedZoneId: props.route53Params?.route53HostedZoneId,
            }
        );

        /* when deleting the stack, both web acl and acm cert are dependent
           on the app load balancer. So, we need to delete the alb first. */
        if (this.webAcl) {
            loadBalancerControllerCleanup.node.addDependency(this.webAcl);
        }
        if (this.certificate) {
            loadBalancerControllerCleanup.node.addDependency(this.certificate);
        }

        // create monitoring dashboard
        // prettier-ignore
        new MonitoringDashboard(this, 'druid-ops-dashboard', { // NOSONAR (typescript:S1848) - cdk construct is used

            druidClusterName: druidEksProps.druidClusterParams.druidClusterName,
            computeWidgets: [
                ...this.getEksWidgets(druidEksProps.druidClusterParams.druidClusterName),
            ],
            metadataDatabaseWidget: [...this.cluster.metadataDb.getCloudWatchWidgets()],
            deepStorageBucketName: this.baseInfra.deepStorageBucket.bucketName,
        });
        // prettier-ignore
        new DruidAlarms(this, 'alarms', { // NOSONAR (typescript:S1848) - cdk construct is used
            druidClusterName: druidEksProps.druidClusterParams.druidClusterName,
            dbIdentifier: this.cluster.metadataDb.dbIdentifier,
            zookeeperNodeCount:
                eksClusterConfig.capacityProviderConfig['zookeeper'].minNodes,
            computeAlarms: this.getEksAlarms(
                druidEksProps.druidClusterParams.druidClusterName,
                eksClusterConfig
            ),
            removalPolicy: druidEksProps.removalPolicy,
        });

        cdk.Aspects.of(this).add(
            new CfnNagResourcePathRulesSuppressionAspect({
                /* eslint-disable @typescript-eslint/naming-convention */
                '/CreationRole/DefaultPolicy/Resource': [
                    {
                        id: 'W12',
                        reason: 'The resource * is required for IAM related permissions',
                    },
                ],
                '/druid-application-sa/Role/DefaultPolicy/Resource': [
                    {
                        id: 'W12',
                        reason: 'The resource * is required for IAM related permissions',
                    },
                ],
                '/external-dns/Role/DefaultPolicy/Resource': [
                    {
                        id: 'W12',
                        reason: 'The resource * is required for IAM related permissions',
                    },
                ],
                '/alb-sa/Role/DefaultPolicy/Resource': [
                    {
                        id: 'W12',
                        reason: 'The resource * is required for IAM related permissions',
                    },
                    {
                        id: 'W76',
                        reason: 'This role is created by ALB controller. THe SPCM is not an issue.',
                    },
                ],
                '/load-balancer-controller-cleaner-fn/ServiceRole/DefaultPolicy/Resource':
                    [
                        {
                            id: 'W12',
                            reason: 'The resource * is required for IAM related permissions',
                        },
                    ],
                '/Custom::AWSCDKOpenIdConnectProviderCustomResourceProvider/Role': [
                    {
                        id: 'W11',
                        reason: 'This role is implicitly created by CDK. Resource * is required for it to function.',
                    },
                ],
                '/Custom::AWSCDKOpenIdConnectProviderCustomResourceProvider/Handler': [
                    {
                        id: 'W58',
                        reason: 'Lambda function already has the correct permissions to write CloudWatch logs.',
                    },
                    {
                        id: 'W89',
                        reason: 'Lambda function is not necessarily needed to deploy in a VPC.',
                    },
                    {
                        id: 'W92',
                        reason: 'Lambda functions donot need to define ReservedConcurrentExecutions.',
                    },
                ],
                '/AWSCDKCfnUtilsProviderCustomResourceProvider/Handler': [
                    {
                        id: 'W58',
                        reason: 'Lambda function already has the correct permissions to write CloudWatch logs.',
                    },
                    {
                        id: 'W89',
                        reason: 'Lambda function is not necessarily needed to deploy in a VPC.',
                    },
                    {
                        id: 'W92',
                        reason: 'Lambda functions do not need to define ReservedConcurrentExecutions.',
                    },
                ],
                '/clean-up/load-balancer-controller-cleaner-fn/Resource': [
                    {
                        id: 'W58',
                        reason: 'Lambda function already has the correct permissions to write CloudWatch logs.',
                    },
                    {
                        id: 'W89',
                        reason: 'Lambda function is not necessarily needed to deploy in a VPC.',
                    },
                    {
                        id: 'W92',
                        reason: 'Lambda functions donot need to define ReservedConcurrentExecutions.',
                    },
                ],
                '/eks-cluster/ControlPlaneSecurityGroup/Resource': [
                    {
                        id: 'W5',
                        reason: 'This is to allow the druid services to download the required dependencies.',
                    },
                    {
                        id: 'W40',
                        reason: 'This is to allow the druid services to download the required dependencies.',
                    },
                ],
                /* eslint-enable @typescript-eslint/naming-convention */
            })
        );
    }

    private getMinPodCount(
        eksClusterConfig: EksConfig,
        processType: DruidProcessType
    ): number {
        return eksClusterConfig.capacityProviderType === EksCapacityProviderType.EC2
            ? eksClusterConfig.capacityProviderConfig[
                  mapProcessTypeToNodeType(processType)
              ].minNodes
            : eksClusterConfig.capacityProviderConfig[processType].minNodes;
    }

    private getEksAlarms(clusterName: string, eksClusterConfig: EksConfig): cw.Alarm[] {
        const alarms = [
            new cw.Alarm(this, 'cluster-failed-node-alarm', {
                metric: this.getNodeCountMetric('cluster_failed_node_count'),
                ...commonAlarmProps,
                threshold: 0,
            }),
        ];
        Object.values(DruidProcessType).forEach((processType) => {
            alarms.push(
                new cw.Alarm(this, `${processType}-pod-count-alarm`, {
                    metric: this.getPodCountPerServiceMetrics(
                        this.getServiceName(clusterName, processType)
                    ),
                    ...commonAlarmProps,
                    threshold: this.getMinPodCount(eksClusterConfig, processType),
                    comparisonOperator: cw.ComparisonOperator.LESS_THAN_THRESHOLD,
                })
            );
            alarms.push(
                new cw.Alarm(this, `${processType}-cpu-utilisation-alarm`, {
                    metric: this.getPodResourceUtilization(
                        this.getServiceName(clusterName, processType),
                        'cpu'
                    ),
                    ...commonAlarmProps,
                })
            );
            alarms.push(
                new cw.Alarm(this, `${processType}-memory-utilisation-alarm`, {
                    metric: this.getPodResourceUtilization(
                        this.getServiceName(clusterName, processType),
                        'memory'
                    ),
                    ...commonAlarmProps,
                })
            );
        });

        return alarms;
    }

    private getServiceName(clusterName: string, processType: DruidProcessType): string {
        return processType === DruidProcessType.ZOOKEEPER
            ? DruidProcessType.ZOOKEEPER
            : `druid-${clusterName}-${processType.toLowerCase()}s`;
    }

    private getEksWidgets(clusterName: string): cw.IWidget[] {
        return [
            this.getNodeCountWidget(),
            new cw.GraphWidget({
                ...commonGraphWidgetProps,
                title: 'Pod Count By Service',
                left: Object.values(DruidProcessType).map((processType) =>
                    this.getPodCountPerServiceMetrics(
                        this.getServiceName(clusterName, processType)
                    )
                ),
            }),
            new cw.GraphWidget({
                ...commonGraphWidgetProps,
                title: 'CPU Usage By Service',
                left: Object.values(DruidProcessType).map((processType) =>
                    this.getPodResourceUtilization(
                        this.getServiceName(clusterName, processType),
                        'cpu'
                    )
                ),
            }),
            new cw.GraphWidget({
                ...commonGraphWidgetProps,
                title: 'Memory Usage By Service',
                left: Object.values(DruidProcessType).map((processType) =>
                    this.getPodResourceUtilization(
                        this.getServiceName(clusterName, processType),
                        'memory'
                    )
                ),
            }),
        ];
    }

    private getNodeCountWidget(): cw.IWidget {
        return new cw.GraphWidget({
            ...commonGraphWidgetProps,
            title: 'Cluster Node Count',
            left: [
                this.getNodeCountMetric(
                    'cluster_failed_node_count',
                    'failed worker node count'
                ),
                this.getNodeCountMetric('cluster_node_count', 'worker node count'),
            ],
        });
    }

    private getNodeCountMetric(metricName: string, label?: string): cw.IMetric {
        return new cw.Metric({
            ...this.commonMetricProps,
            metricName,
            dimensionsMap: {
                // eslint-disable-next-line @typescript-eslint/naming-convention
                ClusterName: this.cluster.eksCluster.clusterName,
            },
            label,
        });
    }

    private getPodCountPerServiceMetrics(serviceName: string): cw.IMetric {
        return new cw.Metric({
            ...this.commonMetricProps,
            metricName: 'service_number_of_running_pods',
            dimensionsMap: {
                /* eslint-disable @typescript-eslint/naming-convention */
                ClusterName: this.cluster.eksCluster.clusterName,
                Service: serviceName,
                Namespace: 'default',
                /* eslint-enable @typescript-eslint/naming-convention */
            },
            label: `${serviceName} pod count`,
        });
    }

    private getPodResourceUtilization(
        serviceName: string,
        resourceType: 'cpu' | 'memory'
    ): cw.IMetric {
        return new cw.Metric({
            ...this.commonMetricProps,
            metricName: `pod_${resourceType}_utilization`,
            dimensionsMap: {
                /* eslint-disable @typescript-eslint/naming-convention */
                ClusterName: this.cluster.eksCluster.clusterName,
                Service: serviceName,
                Namespace: 'default',
                /* eslint-enable @typescript-eslint/naming-convention */
            },
            label: `${serviceName} ${resourceType} usage`,
        });
    }
}
