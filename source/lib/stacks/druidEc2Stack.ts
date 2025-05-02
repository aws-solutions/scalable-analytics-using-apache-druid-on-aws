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
/* eslint-disable @typescript-eslint/no-non-null-assertion */
import * as autoscaling from 'aws-cdk-lib/aws-autoscaling';
import * as cdk from 'aws-cdk-lib';
import * as cw from 'aws-cdk-lib/aws-cloudwatch';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import * as elb from 'aws-cdk-lib/aws-elasticloadbalancingv2';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as metadataStoreUtils from '../utils/metadataStoreUtils';
import * as route53 from 'aws-cdk-lib/aws-route53';
import * as utils from '../utils/utils';
import * as wafv2 from 'aws-cdk-lib/aws-wafv2';

import {
    ALB_ACCESS_LOGS_PREFIX,
    DEFAULT_TIER,
    DRUID_METRICS_NAMESPACE,
    DRUID_SECURITY_GROUP_NAME,
    INSTANCE_TERMINATION_TIMEOUT,
} from '../utils/constants';
import {
    AutoScalingPolicy,
    DruidClusterParameters,
    DruidNodeType,
    DruidStackProps,
    Ec2Config,
} from '../utils/types';
import {
    CfnNagResourcePathRulesSuppressionAspect,
    addCfnNagSuppression,
} from '../constructs/cfnNagSuppression';
import {
    CustomLifecycleHookParams,
    DruidAutoScalingGroup,
    DruidAutoScalingGroupContext,
} from '../constructs/druidAutoScalingGroup';
import {
    MonitoringDashboard,
    commonGraphWidgetProps,
    commonTextWidgetProps,
} from '../constructs/monitoringDashboard';

import { BaseInfrastructure } from '../constructs/baseInfrastructure';
import { Construct } from 'constructs';
import { DruidAlarms, commonAlarmProps } from '../constructs/druidAlarm';
import { DruidStack } from './druidStack';
import { ISecret } from 'aws-cdk-lib/aws-secretsmanager';
import { InternalCertificateAuthority } from '../constructs/internalCertificateAuthority';
import { LoadBalancerTarget } from 'aws-cdk-lib/aws-route53-targets';
import { MetadataStore } from '../constructs/metadataStore';
import { OperationalMetricsCollection } from '../constructs/operationalMetricCollection';
import { RetentionConfig } from '../constructs/retentionConfig';
import { ZooKeeper } from '../constructs/zookeeper';

/**
 * This class build Druid Stack. Creates Autoscaling group for overlord, middleManager, coordinator, query, historical and zookeeper and launches them in EC2.
 * Creates RDS Database
 * Creates TargetGrp, Iamrole, logGroup, securitygrp, loadbalancer.
 */
export class DruidEc2Stack extends DruidStack {
    private readonly autoScalingGroupNames: Map<string, string>;
    private readonly druidBaseUrl: string;

    public constructor(
        scope: Construct,
        id: string,
        private readonly props: DruidStackProps
    ) {
        super(scope, id, props);

        const certificateGenerator = new InternalCertificateAuthority(
            this,
            'internal-certificate-authority',
            {
                vpc: this.baseInfra.vpc,
            }
        );

        const ec2Config = props.clusterParams.hostingConfig as Ec2Config;
        this.validateConfig(ec2Config);

        this.autoScalingGroupNames = new Map<string, string>();

        const securityGroup = this.createSecurityGroup(
            this.baseInfra.vpc,
            this.baseInfra.bastion
        );

        const rdsMetadataConstruct = metadataStoreUtils.createMetadataStore(
            this,
            props.clusterParams,
            this.baseInfra,
            securityGroup,
            props.removalPolicy
        );

        const ec2IamRole = this.createInstanceRole(
            props.clusterParams,
            this.baseInfra,
            rdsMetadataConstruct,
            certificateGenerator.TlsCertificate
        );

        const appLoadBalancer = new elb.ApplicationLoadBalancer(
            this,
            'main-app-load-balancer',
            {
                vpc: this.baseInfra.vpc,
                internetFacing: props.clusterParams.internetFacing,
                idleTimeout: cdk.Duration.seconds(120),
            }
        );

        if (props.clusterParams.enableFipsEndpoints) {
            cdk.Tags.of(appLoadBalancer).add('alb-fips-enabled', '');
        }

        securityGroup.connections.allowFrom(
            appLoadBalancer,
            ec2.Port.tcp(8888),
            'Allow HTTP access to query nodes'
        );
        if (this.webAcl) {
            new wafv2.CfnWebACLAssociation(this, 'MyCDKWebACLAssociation', {
                resourceArn: appLoadBalancer.loadBalancerArn,
                webAclArn: this.webAcl.attrArn,
            });
        }

        // ELBv2 access logging is not supported on environment-agnostic stacks
        if (!cdk.Token.isUnresolved(cdk.Stack.of(this).region)) {
            appLoadBalancer.logAccessLogs(
                this.baseInfra.serverAccessLogsBucket,
                ALB_ACCESS_LOGS_PREFIX
            );
        }
        addCfnNagSuppression(appLoadBalancer, [
            {
                id: 'W52',
                reason: 'Elastic Load Balancer V2 access logging is not supported on environment agnostic stack',
            },
        ]);

        this.druidBaseUrl = props.druidDomain
            ? `https://${props.druidDomain}`
            : `http://${appLoadBalancer.loadBalancerDnsName}`;

        if (this.hostedZone && props.route53Params) {
            new route53.ARecord(this, 'route53-alias-record', {
                zone: this.hostedZone,
                target: route53.RecordTarget.fromAlias(
                    new LoadBalancerTarget(appLoadBalancer)
                ),
                recordName: props.druidDomain,
            });
        }

        // create ZooKeeper
        const zookeeper = new ZooKeeper(this, 'zookeeper', {
            baseInfra: this.baseInfra,
            clusterParams: props.clusterParams,
            clusterSecurityGroup: securityGroup,
            customAmi: props.customAmi,
        });
        zookeeper.zookeeperASGs.forEach((zkAsg, index) => {
            if (this.baseInfra.zookeeperImageDeployment) {
                zkAsg.node.addDependency(this.baseInfra.zookeeperImageDeployment);
            }
            this.autoScalingGroupNames.set(
                `${DruidNodeType.ZOOKEEPER}-${index + 1}`,
                zkAsg.autoScalingGroupName
            );
        });

        // Shared context parameters for Druid ASGs
        const asgContext: DruidAutoScalingGroupContext = {
            ec2IamRole,
            baseInfra: this.baseInfra,
            clusterParams: props.clusterParams,
            securityGroup,
            rdsMetadataConstruct,
            zookeeper,
            customAmi: props.customAmi,
            solutionVersion: props.solutionVersion,
            tlsCertificateSecretName: certificateGenerator.TlsCertificate.secretName,
        };

        // create data tiers
        const dataAsgList = this.createDataTiers(asgContext);
        dataAsgList.forEach((dataAsg) => {
            if (this.baseInfra.druidImageDeployment) {
                dataAsg.autoScalingGroup.node.addDependency(
                    this.baseInfra.druidImageDeployment!,
                );
            }
            dataAsg.autoScalingGroup.node.addDependency(
                zookeeper.zookeeperASGs[zookeeper.zookeeperASGs.length - 1]
            );
        });

        // create query tiers
        const [queryAsgList, queryTargetGroup] = this.createQueryTiers(
            asgContext,
            appLoadBalancer
        );
        queryAsgList.forEach((queryAsg) => {
            dataAsgList.forEach((dataAsg) => {
                queryAsg.autoScalingGroup.node.addDependency(dataAsg.autoScalingGroup);
            });
        });

        // create master asg
        const masterAsg = this.createMasterASG(asgContext);

        queryAsgList.forEach((queryAsg) => {
            masterAsg.autoScalingGroup.node.addDependency(queryAsg.autoScalingGroup);
        });

        new OperationalMetricsCollection(this, 'metrics-collection', {
            vpc: this.baseInfra.vpc,
            awsSolutionId: props.solutionId,
            awsSolutionVersion: props.solutionVersion,
            druidVersion: props.clusterParams.druidVersion,
            hostingPlatform: 'EC2',
            internetFacing: props.clusterParams.internetFacing ?? false,
            retainData: props.removalPolicy === cdk.RemovalPolicy.RETAIN,
        });

        if (props.clusterParams.druidRetentionRules) {
            new RetentionConfig(this, 'druid-retention-config', {
                vpc: this.baseInfra.vpc,
                retentionRules: props.clusterParams.druidRetentionRules,
                druidEndpoint: this.druidBaseUrl,
                druidSystemUserSecret: rdsMetadataConstruct.druidInternalSystemUserSecret,
                dependency: masterAsg.autoScalingGroup,
            });
        }

        if (props.clusterParams.oidcIdpConfig?.groupRoleMappings) {
            this.createDefaultRoles(
                this.druidBaseUrl,
                rdsMetadataConstruct.druidInternalSystemUserSecret,
                props.clusterParams.oidcIdpConfig.groupRoleMappings,
                masterAsg.autoScalingGroup
            );
        }

        const canary = this.createCanary(this.druidBaseUrl);

        this.createMonitoringDashboard(
            props.clusterParams.druidClusterName,
            this.baseInfra,
            appLoadBalancer,
            rdsMetadataConstruct,
            canary.canaryName
        );
        this.createAlarms(
            props.clusterParams.druidClusterName,
            ec2Config,
            appLoadBalancer,
            queryTargetGroup,
            rdsMetadataConstruct,
            props.removalPolicy
        );

        new cdk.CfnOutput(this, 'druid-base-url', {
            value: this.druidBaseUrl,
        });
    }

    private createCustomLifecycleHookParams(autoScalingPolicy?: AutoScalingPolicy): CustomLifecycleHookParams | undefined {
        return autoScalingPolicy?.customLifecycleHookParams ? {
            defaultResult: autoScalingPolicy.customLifecycleHookParams.defaultResult as autoscaling.DefaultResult ?? autoscaling.DefaultResult.CONTINUE,
            heartbeatTimeout: autoScalingPolicy.customLifecycleHookParams.heartbeatTimeout ?? INSTANCE_TERMINATION_TIMEOUT,
        } : undefined;
    }

    private createMasterASG(
        asgContext: DruidAutoScalingGroupContext,
    ): DruidAutoScalingGroup {
        const druidConfig = asgContext.clusterParams.hostingConfig as Ec2Config;
        const autoScalingPolicy = druidConfig['master']?.autoScalingPolicy;
        const customLifecycleHookParams = this.createCustomLifecycleHookParams(autoScalingPolicy);

        const masterAsg = this.createAutoScalingGroup(asgContext, DruidNodeType.MASTER, undefined, undefined, customLifecycleHookParams);

        return masterAsg;
    }

    private createQueryASG(
        asgContext: DruidAutoScalingGroupContext,
        queryTargetGrp: elb.IApplicationTargetGroup,
        serviceTier: string,
        brokerTiers: string[],
        autoScalingPolicy?: AutoScalingPolicy
    ): DruidAutoScalingGroup {
        const queryTierName = utils.getNodeTierName(DruidNodeType.QUERY, serviceTier);
        const customLifecycleHookParams = this.createCustomLifecycleHookParams(autoScalingPolicy);

        const queryAsg = this.createAutoScalingGroup(
            asgContext,
            DruidNodeType.QUERY,
            serviceTier,
            brokerTiers,
            customLifecycleHookParams
        );

        queryAsg.autoScalingGroup.attachToApplicationTargetGroup(queryTargetGrp);

        if (autoScalingPolicy?.cpuUtilisationPercent) {
            queryAsg.autoScalingGroup.scaleOnCpuUtilization(
                `${queryTierName}-scale-cpu`,
                {
                    targetUtilizationPercent: autoScalingPolicy.cpuUtilisationPercent,
                }
            );
        }

        if (autoScalingPolicy?.requestCountPerTarget) {
            queryAsg.autoScalingGroup.scaleOnRequestCount(
                `${queryTierName}-scale-request-count`,
                {
                    targetRequestsPerMinute: autoScalingPolicy.requestCountPerTarget,
                }
            );
        }

        this.createScheduledAutoScalingPolicy(
            queryTierName,
            queryAsg.autoScalingGroup,
            autoScalingPolicy
        );

        return queryAsg;
    }

    private createDataASG(
        asgContext: DruidAutoScalingGroupContext,
        serviceTier: string,
        autoScalingPolicy?: AutoScalingPolicy
    ): DruidAutoScalingGroup {
        const dataTierName = utils.getNodeTierName(DruidNodeType.DATA, serviceTier);
        const customLifecycleHookParams = this.createCustomLifecycleHookParams(autoScalingPolicy);

        const dataAsg = this.createAutoScalingGroup(
            asgContext,
            DruidNodeType.DATA,
            serviceTier,
            undefined,
            customLifecycleHookParams
        );

        if (autoScalingPolicy?.cpuUtilisationPercent) {
            dataAsg.autoScalingGroup.scaleOnCpuUtilization(`${dataTierName}-scale-cpu`, {
                targetUtilizationPercent: autoScalingPolicy.cpuUtilisationPercent,
            });
        }

        if (autoScalingPolicy?.diskUtilisationScaleSteps) {
            const diskUtilisationMetric = new cw.MathExpression({
                expression: '(usedDisk / totalDisk) * 100',
                usingMetrics: {
                    totalDisk: new cw.Metric({
                        namespace: DRUID_METRICS_NAMESPACE,
                        metricName: 'disk_total',
                        period: cdk.Duration.minutes(1),
                        statistic: 'Sum',
                        dimensionsMap: {
                            // eslint-disable-next-line @typescript-eslint/naming-convention
                            AutoScalingGroupName:
                                dataAsg.autoScalingGroup.autoScalingGroupName,
                        },
                    }),
                    usedDisk: new cw.Metric({
                        namespace: DRUID_METRICS_NAMESPACE,
                        metricName: 'disk_used',
                        statistic: 'Sum',
                        period: cdk.Duration.minutes(1),
                        dimensionsMap: {
                            // eslint-disable-next-line @typescript-eslint/naming-convention
                            AutoScalingGroupName:
                                dataAsg.autoScalingGroup.autoScalingGroupName,
                        },
                    }),
                },
            });
            dataAsg.autoScalingGroup.scaleOnMetric(
                `${dataTierName}-scale-disk-utilisation`,
                {
                    metric: diskUtilisationMetric,
                    scalingSteps: autoScalingPolicy.diskUtilisationScaleSteps,
                    adjustmentType: autoscaling.AdjustmentType.CHANGE_IN_CAPACITY,
                }
            );
        }

        if (autoScalingPolicy?.pendingTaskCountScaleSteps) {
            const pendingTaskCountMetric = new cw.Metric({
                namespace: DRUID_METRICS_NAMESPACE,
                period: cdk.Duration.minutes(1),
                dimensionsMap: {
                    // eslint-disable-next-line @typescript-eslint/naming-convention
                    'Druid.Service': 'druid/overlord',
                },
                metricName: 'task/pending/count',
            });

            dataAsg.autoScalingGroup.scaleOnMetric(`${dataTierName}-scale-pending-task`, {
                metric: pendingTaskCountMetric,
                scalingSteps: autoScalingPolicy.pendingTaskCountScaleSteps,
                adjustmentType: autoscaling.AdjustmentType.CHANGE_IN_CAPACITY,
            });
        }

        this.createScheduledAutoScalingPolicy(
            dataTierName,
            dataAsg.autoScalingGroup,
            autoScalingPolicy
        );

        return dataAsg;
    }

    private createMiddleManagerASG(
        asgContext: DruidAutoScalingGroupContext,
        serviceTier: string,
        autoScalingPolicy?: AutoScalingPolicy
    ): DruidAutoScalingGroup {
        const middleManagerTierName = utils.getNodeTierName(
            DruidNodeType.MIDDLE_MANAGER,
            serviceTier
        );
        const customLifecycleHookParams = this.createCustomLifecycleHookParams(autoScalingPolicy);

        const middleManagerAsg = this.createAutoScalingGroup(
            asgContext,
            DruidNodeType.MIDDLE_MANAGER,
            serviceTier,
            undefined,
            customLifecycleHookParams
        );

        if (autoScalingPolicy?.cpuUtilisationPercent) {
            middleManagerAsg.autoScalingGroup.scaleOnCpuUtilization(
                `${middleManagerTierName}-scale-cpu`,
                {
                    targetUtilizationPercent: autoScalingPolicy.cpuUtilisationPercent,
                }
            );
        }

        this.createScheduledAutoScalingPolicy(
            middleManagerTierName,
            middleManagerAsg.autoScalingGroup,
            autoScalingPolicy
        );

        if (autoScalingPolicy?.pendingTaskCountScaleSteps) {
            const pendingTaskCountMetric = new cw.Metric({
                namespace: DRUID_METRICS_NAMESPACE,
                period: cdk.Duration.minutes(1),
                dimensionsMap: {
                    // eslint-disable-next-line @typescript-eslint/naming-convention
                    'Druid.Service': 'druid/overlord',
                },
                metricName: 'task/pending/count',
            });

            middleManagerAsg.autoScalingGroup.scaleOnMetric(
                `${middleManagerTierName}-scale-pending-task`,
                {
                    metric: pendingTaskCountMetric,
                    scalingSteps: autoScalingPolicy.pendingTaskCountScaleSteps,
                    adjustmentType: autoscaling.AdjustmentType.CHANGE_IN_CAPACITY,
                }
            );
        }
        return middleManagerAsg;
    }

    private createHistoricalASG(
        asgContext: DruidAutoScalingGroupContext,
        serviceTier: string,
        autoScalingPolicy?: AutoScalingPolicy
    ): DruidAutoScalingGroup {
        const historicalTierName = utils.getNodeTierName(
            DruidNodeType.HISTORICAL,
            serviceTier
        );
        const customLifecycleHookParams = this.createCustomLifecycleHookParams(autoScalingPolicy);

        const historicalAsg = this.createAutoScalingGroup(
            asgContext,
            DruidNodeType.HISTORICAL,
            serviceTier,
            undefined,
            customLifecycleHookParams
        );

        if (autoScalingPolicy?.cpuUtilisationPercent) {
            historicalAsg.autoScalingGroup.scaleOnCpuUtilization('historical-scale-cpu', {
                targetUtilizationPercent: autoScalingPolicy.cpuUtilisationPercent,
            });
        }

        if (autoScalingPolicy?.diskUtilisationScaleSteps) {
            const diskUtilisationMetric = new cw.MathExpression({
                expression: '(usedDisk / totalDisk) * 100',
                usingMetrics: {
                    totalDisk: new cw.Metric({
                        namespace: DRUID_METRICS_NAMESPACE,
                        metricName: 'disk_total',
                        period: cdk.Duration.minutes(1),
                        statistic: 'Sum',
                        dimensionsMap: {
                            // eslint-disable-next-line @typescript-eslint/naming-convention
                            AutoScalingGroupName:
                                historicalAsg.autoScalingGroup.autoScalingGroupName,
                        },
                    }),
                    usedDisk: new cw.Metric({
                        namespace: DRUID_METRICS_NAMESPACE,
                        metricName: 'disk_used',
                        statistic: 'Sum',
                        period: cdk.Duration.minutes(1),
                        dimensionsMap: {
                            // eslint-disable-next-line @typescript-eslint/naming-convention
                            AutoScalingGroupName:
                                historicalAsg.autoScalingGroup.autoScalingGroupName,
                        },
                    }),
                },
            });

            historicalAsg.autoScalingGroup.scaleOnMetric(
                `${historicalTierName}-scale-disk-utilisation`,
                {
                    metric: diskUtilisationMetric,
                    scalingSteps: autoScalingPolicy.diskUtilisationScaleSteps,
                    adjustmentType: autoscaling.AdjustmentType.CHANGE_IN_CAPACITY,
                }
            );
        }

        this.createScheduledAutoScalingPolicy(
            historicalTierName,
            historicalAsg.autoScalingGroup,
            autoScalingPolicy
        );

        return historicalAsg;
    }

    //IAM Role to be attached to EC2
    private createInstanceRole(
        clusterParams: DruidClusterParameters,
        baseInfra: BaseInfrastructure,
        rdsMetadataConstruct: MetadataStore,
        tlsCertificate: ISecret
    ): iam.IRole {
        const role = new iam.Role(this, 'EC2InstanceRole', {
            managedPolicies: [
                iam.ManagedPolicy.fromAwsManagedPolicyName('CloudwatchAgentServerPolicy'),
                iam.ManagedPolicy.fromAwsManagedPolicyName(
                    'AmazonSSMManagedInstanceCore'
                ),
            ],
            assumedBy: new iam.ServicePrincipal('ec2.amazonaws.com'),
        });

        role.addToPrincipalPolicy(
            new iam.PolicyStatement({
                effect: iam.Effect.ALLOW,
                actions: [
                    's3:Put*',
                    's3:Get*',
                    's3:HeadObject',
                    's3:List*',
                    's3:DeleteObject',
                ],
                resources: [
                    baseInfra.deepStorageBucket.bucketArn,
                    `${baseInfra.deepStorageBucket.bucketArn}/*`,
                    baseInfra.installationBucket.bucketArn,
                    `${baseInfra.installationBucket.bucketArn}/*`,
                ],
            })
        );
        role.addToPrincipalPolicy(
            new iam.PolicyStatement({
                effect: iam.Effect.ALLOW,
                actions: [
                    'ec2:Describe*',
                    'ec2:CreateTags',
                    'autoscaling:Describe*',
                    'logs:PutRetentionPolicy',
                ],
                resources: ['*'],
            })
        );

        if (baseInfra.deepStorageEncryptionKey) {
            role.addToPrincipalPolicy(
                new iam.PolicyStatement({
                    effect: iam.Effect.ALLOW,
                    actions: [
                        'kms:Encrypt*',
                        'kms:Decrypt*',
                        'kms:ReEncrypt*',
                        'kms:GenerateDataKey*',
                        'kms:Describe*',
                    ],
                    resources: [baseInfra.deepStorageEncryptionKey.keyArn],
                })
            );
        }

        clusterParams.druidInstanceIamPolicyArns?.forEach(
            (druidInstanceIamPolicyArn, index) => {
                role.addManagedPolicy(
                    iam.ManagedPolicy.fromManagedPolicyArn(
                        this,
                        `druid-instance-custom-policy-${index}`,
                        druidInstanceIamPolicyArn
                    )
                );
            }
        );

        addCfnNagSuppression(
            role,
            [
                {
                    id: 'W12',
                    reason: 'Resource * is required for autoscaling and logs related permissions',
                },
                {
                    id: 'W76',
                    reason: 'The IAM permissions are required to perform necessary functionalities.',
                },
            ],
            'DefaultPolicy'
        );

        rdsMetadataConstruct.dbMasterUserSecret.grantRead(role);
        rdsMetadataConstruct.druidAdminUserSecret.grantRead(role);
        rdsMetadataConstruct.druidInternalSystemUserSecret.grantRead(role);
        baseInfra.oidcIdpClientSecret?.grantRead(role);
        tlsCertificate.grantRead(role);

        return role;
    }

    //Security Group to add inbound rules
    private createSecurityGroup(
        vpc: ec2.IVpc,
        bastion?: ec2.BastionHostLinux
    ): ec2.SecurityGroup {
        const secGrp = new ec2.SecurityGroup(this, `${DRUID_SECURITY_GROUP_NAME}-Id`, {
            vpc,
            description: `Security group facilitating traffic in and out of Druid cluster`,
        });

        secGrp.addIngressRule(
            secGrp,
            ec2.Port.allTcp(),
            'Ingress rule for Druid components.'
        );

        if (bastion) {
            secGrp.connections.allowFrom(
                bastion,
                ec2.Port.tcp(22),
                'Allow SSH connection at port 22 from Bastion Host'
            );
        }

        addCfnNagSuppression(secGrp, [
            {
                id: 'W40',
                reason: 'Allowing to talk to Druid peers and download necessary dependencies from internet',
            },
            {
                id: 'W5',
                reason: 'Allowing to talk to Druid peers and download necessary dependencies from internet',
            },
            {
                id: 'W27',
                reason: 'Multiple ports are used for different purposes.',
            },
        ]);

        return secGrp;
    }

    //Create Asg Grp for different process types
    private createAutoScalingGroup(
        asgContext: DruidAutoScalingGroupContext,
        nodeType: DruidNodeType,
        serviceTier?: string,
        brokerTiers?: string[],
        customLifecycleHookParams?: CustomLifecycleHookParams,
    ): DruidAutoScalingGroup {
        const nodeTierName = utils.getNodeTierName(nodeType, serviceTier);

        const druidAutoScalingGroup = new DruidAutoScalingGroup(
            this,
            `${nodeTierName}-asg`,
            {
                asgContext,
                nodeType,
                serviceTier,
                brokerTiers,
                baseUrl: this.druidBaseUrl,
                customLifecycleHookParams,
            }
        );

        this.autoScalingGroupNames.set(
            nodeTierName,
            druidAutoScalingGroup.autoScalingGroup.autoScalingGroupName
        );
        druidAutoScalingGroup.node.addDependency(asgContext.rdsMetadataConstruct);
        return druidAutoScalingGroup;
    }

    //Creating listeners on port 80 and 443 with their actions
    private attachListenersToLoadBalancers(
        loadbalancer: elb.IApplicationLoadBalancer,
        targetGrp: elb.IApplicationTargetGroup
    ): void {
        if (this.certificate) {
            loadbalancer.addListener(`listener-http-id`, {
                port: 80,
                defaultAction: elb.ListenerAction.redirect({
                    port: '443',
                    protocol: 'HTTPS',
                }),
            });

            loadbalancer.addListener(`listener-https-id`, {
                port: 443,
                certificates: [this.certificate],
                defaultAction: elb.ListenerAction.forward([targetGrp]),
                sslPolicy: this.props.clusterParams.enableFipsEndpoints
                    ? elb.SslPolicy.TLS12 // fall back to 1.2 for FIPS enabled ALB as 1.3 is yet to be supported
                    : elb.SslPolicy.RECOMMENDED_TLS,
            });
        } else {
            loadbalancer.addListener(`listener-http-id`, {
                port: 80,
                defaultAction: elb.ListenerAction.forward([targetGrp]),
            });
        }

        cdk.Aspects.of(loadbalancer).add(
            new CfnNagResourcePathRulesSuppressionAspect({
                // eslint-disable-next-line @typescript-eslint/naming-convention
                'listener-http-id/Resource': [
                    {
                        id: 'W56',
                        reason: 'HTTP listener is required to support optional Route 53 domain',
                    },
                ],

                // eslint-disable-next-line @typescript-eslint/naming-convention
                'SecurityGroup/Resource': [
                    {
                        id: 'W2',
                        reason: 'Allows inbound traffic from anywhere for ALB',
                    },
                    {
                        id: 'W9',
                        reason: 'Allows inbound traffic from anywhere for ALB',
                    },
                ],
            })
        );
    }

    private createAutoScalingGroupWidgets(
        nodeTierName: string,
        autoScalingGroupName: string
    ): cw.IWidget[] {
        return [
            new cw.TextWidget({
                ...commonTextWidgetProps,
                markdown: `### Druid ${nodeTierName} ASG - ${autoScalingGroupName} - Key Performance Indicators`,
            }),
            new cw.GraphWidget({
                title: 'CPU Utilization (%)',
                ...commonGraphWidgetProps,
                left: [
                    utils.getEc2ResourceMetric(autoScalingGroupName, 'CPUUtilization'),
                ],
            }),
            new cw.GraphWidget({
                title: 'Network In/Out (bytes)',
                ...commonGraphWidgetProps,
                left: [
                    utils.getEc2ResourceMetric(autoScalingGroupName, 'NetworkIn'),
                    utils.getEc2ResourceMetric(autoScalingGroupName, 'NetworkOut'),
                ],
            }),
            new cw.GraphWidget({
                title: 'Memory Utilisation (%)',
                ...commonGraphWidgetProps,
                left: [utils.getMemoryUsageMetric(autoScalingGroupName)],
            }),
            new cw.GraphWidget({
                title: 'Disk Utilisation (%)',
                ...commonGraphWidgetProps,
                left: [utils.getDiskUsageMetric(autoScalingGroupName)],
            }),
        ];
    }

    private createAutoScalingGroupAlarms(
        nodeTierName: string,
        autoScalingGroupName: string
    ): cw.Alarm[] {
        return [
            new cw.Alarm(this, `${nodeTierName}-cpu-utilisation-alarm`, {
                metric: utils.getEc2ResourceMetric(
                    autoScalingGroupName,
                    'CPUUtilization'
                ),
                ...commonAlarmProps,
            }),
            new cw.Alarm(this, `${nodeTierName}-memory-utilisation-alarm`, {
                metric: utils.getMemoryUsageMetric(autoScalingGroupName),
                ...commonAlarmProps,
            }),
            new cw.Alarm(this, `${nodeTierName}-disk-utilisation-alarm`, {
                metric: utils.getDiskUsageMetric(autoScalingGroupName),
                ...commonAlarmProps,
            }),
        ];
    }

    private validateConfig(hostingConfig: Ec2Config): void {
        // Must configure at least one middleManager group
        if (
            !hostingConfig[DruidNodeType.DATA] &&
            !hostingConfig[DruidNodeType.MIDDLE_MANAGER]
        ) {
            throw new Error(
                'middleManager process type is not found in the druidEc2Config. Please set up data or middleManager in druidEc2Config.'
            );
        }

        // Must configure at least one historical group
        if (
            !hostingConfig[DruidNodeType.DATA] &&
            !hostingConfig[DruidNodeType.HISTORICAL]
        ) {
            throw new Error(
                'Historical process type is not found in the druidEc2Config. Please set up data or historical in druidEc2Config.'
            );
        }

        const cronExpressionSet = new Set();
        for (const [nodeType, nodeGroupConfig] of Object.entries(hostingConfig)) {
            nodeGroupConfig?.autoScalingPolicy?.schedulePolicies?.forEach(
                (schedulePolicy) => {
                    if (
                        !utils.validateCronExpression(schedulePolicy.scheduleExpression)
                    ) {
                        throw new Error(
                            `Cron expression "${schedulePolicy.scheduleExpression}" is not valid in schedulePolicies for ${nodeType} process type.`
                        );
                    }
                    if (cronExpressionSet.has(schedulePolicy.scheduleExpression)) {
                        throw new Error(
                            `Duplicate cron expression "${schedulePolicy.scheduleExpression}" in schedulePolicies for ${nodeType} process type.`
                        );
                    }
                    cronExpressionSet.add(schedulePolicy.scheduleExpression);
                }
            );
        }
    }

    private getBrokerTiers(hostingConfig: Ec2Config): string[] {
        const brokerTiers: [string, number][] = [];

        Object.keys(hostingConfig).forEach((nodeType) => {
            const matchResult = nodeType.match(/^query(\w*)$/);
            if (matchResult) {
                const brokerTier = matchResult[1]
                    ? matchResult[1].substring(1)
                    : DEFAULT_TIER;

                brokerTiers.push([
                    brokerTier,
                    hostingConfig[nodeType]?.servicePriority ?? 0,
                ]);
            }
        });

        brokerTiers.sort((tierX, tierY) => tierY[1] - tierX[1]);

        return brokerTiers.map((tier) => tier[0]);
    }

    private createQueryTiers(
        asgContext: DruidAutoScalingGroupContext,
        appLoadBalancer: elb.ApplicationLoadBalancer
    ): [DruidAutoScalingGroup[], elb.ApplicationTargetGroup] {
        const queryAsgList: DruidAutoScalingGroup[] = [];
        const druidConfig = asgContext.clusterParams.hostingConfig as Ec2Config;
        const brokerTiers = this.getBrokerTiers(druidConfig);

        const queryTargetGrp = new elb.ApplicationTargetGroup(
            this,
            `targetGrp-${DruidNodeType.QUERY}-id`,
            {
                targetType: elb.TargetType.INSTANCE,
                port: 8888,
                protocol: elb.ApplicationProtocol.HTTPS,
                vpc: asgContext.baseInfra.vpc,
                healthCheck: {
                    enabled: true,
                    path: '/status/health',
                    port: 'traffic-port',
                    interval: cdk.Duration.seconds(30),
                },
            }
        );
        this.attachListenersToLoadBalancers(appLoadBalancer, queryTargetGrp);

        Object.keys(druidConfig).forEach((nodeType) => {
            const matchResult = nodeType.match(/^query(\w*)$/);
            if (matchResult) {
                const brokerTier = matchResult[1]
                    ? matchResult[1].substring(1)
                    : DEFAULT_TIER;
                const queryAsg = this.createQueryASG(
                    asgContext,
                    queryTargetGrp,
                    brokerTier,
                    brokerTiers,
                    druidConfig[nodeType]?.autoScalingPolicy
                );
                if (queryAsgList.length > 0) {
                    queryAsg.autoScalingGroup.node.addDependency(
                        queryAsgList[queryAsgList.length - 1].autoScalingGroup
                    );
                }
                queryAsgList.push(queryAsg);
            }
        });
        return [queryAsgList, queryTargetGrp];
    }

    private createDataTiers(
        asgContext: DruidAutoScalingGroupContext
    ): DruidAutoScalingGroup[] {
        const dataAsgList: DruidAutoScalingGroup[] = [];
        const historicalAsgList: DruidAutoScalingGroup[] = [];
        const middleManagerAsgList: DruidAutoScalingGroup[] = [];
        const druidConfig = asgContext.clusterParams.hostingConfig as Ec2Config;

        Object.keys(druidConfig).forEach((nodeType) => {
            const matchResult = nodeType.match(/^(data|middleManager|historical)(\w*)$/);
            if (matchResult) {
                const serviceTier = matchResult[2]
                    ? matchResult[2].substring(1)
                    : DEFAULT_TIER;
                let newAsg: DruidAutoScalingGroup;

                switch (matchResult[1]) {
                    case DruidNodeType.MIDDLE_MANAGER:
                        newAsg = this.createMiddleManagerASG(
                            asgContext,
                            serviceTier,
                            druidConfig[nodeType]?.autoScalingPolicy
                        );
                        this.addAsgToListAndSetDependency(newAsg, middleManagerAsgList);
                        break;

                    case DruidNodeType.HISTORICAL:
                        newAsg = this.createHistoricalASG(
                            asgContext,
                            serviceTier,
                            druidConfig[nodeType]?.autoScalingPolicy
                        );
                        this.addAsgToListAndSetDependency(newAsg, historicalAsgList);
                        break;

                    default:
                        newAsg = this.createDataASG(
                            asgContext,
                            serviceTier,
                            druidConfig[nodeType]?.autoScalingPolicy
                        );
                        this.addAsgToListAndSetDependency(newAsg, dataAsgList);
                        break;
                }
            }
        });

        // Make sure the historical ASG is created before the middle manager ASG.
        if (historicalAsgList.length > 0 && middleManagerAsgList.length > 0) {
            middleManagerAsgList[0].autoScalingGroup.node.addDependency(
                historicalAsgList[historicalAsgList.length - 1].autoScalingGroup
            );
        }

        return dataAsgList.concat(middleManagerAsgList, historicalAsgList);
    }

    private addAsgToListAndSetDependency(
        newAsg: DruidAutoScalingGroup,
        asgList: DruidAutoScalingGroup[]
    ): void {
        if (asgList.length > 0) {
            newAsg.autoScalingGroup.node.addDependency(
                asgList[asgList.length - 1].autoScalingGroup
            );
        }
        asgList.push(newAsg);
    }

    private createMonitoringDashboard(
        druidClusterName: string,
        baseInfra: BaseInfrastructure,
        appLoadBalancer: elb.ApplicationLoadBalancer,
        rdsMetadataConstruct: MetadataStore,
        canaryName: string
    ): void {
        const computeWidgets: cw.IWidget[] = [];
        this.autoScalingGroupNames.forEach((autoScalingGroupName, nodeTierName) => {
            computeWidgets.push(
                ...this.createAutoScalingGroupWidgets(nodeTierName, autoScalingGroupName)
            );
        });

        new MonitoringDashboard(this, 'druid-ops-dashboard', {
            druidClusterName,
            albName: appLoadBalancer.loadBalancerFullName,
            computeWidgets,
            metadataDatabaseWidget: rdsMetadataConstruct.getCloudWatchWidgets(),
            deepStorageBucketName: baseInfra.deepStorageBucket.bucketName,
            canaryName,
        });
    }

    private createAlarms(
        druidClusterName: string,
        ec2Config: Ec2Config,
        appLoadBalancer: elb.ApplicationLoadBalancer,
        queryTargetGroup: elb.ApplicationTargetGroup,
        rdsMetadataConstruct: MetadataStore,
        removalPolicy: cdk.RemovalPolicy
    ): void {
        // Use Alarm instead of IAlarm as addAlarmAction is not present in the IAlarm
        const computeAlarms: cw.Alarm[] = [];
        this.autoScalingGroupNames.forEach((autoScalingGroupName, nodeTierName) => {
            computeAlarms.push(
                ...this.createAutoScalingGroupAlarms(nodeTierName, autoScalingGroupName)
            );
        });

        new DruidAlarms(this, 'alarms', {
            druidClusterName,
            loadBalancerFullName: appLoadBalancer.loadBalancerFullName,
            targetGroupName: queryTargetGroup.targetGroupFullName,
            dbIdentifier: rdsMetadataConstruct.dbIdentifier,
            zookeeperNodeCount: ec2Config[DruidNodeType.ZOOKEEPER]!.minNodes,
            computeAlarms: computeAlarms,
            removalPolicy,
        });
    }

    private createScheduledAutoScalingPolicy(
        nodeTierName: string,
        asg: autoscaling.IAutoScalingGroup,
        autoScalingPolicy?: AutoScalingPolicy
    ): void {
        autoScalingPolicy?.schedulePolicies?.forEach((policy, index) => {
            asg.scaleOnSchedule(`${nodeTierName}-${index}-scale-on-schedule`, {
                schedule: autoscaling.Schedule.expression(policy.scheduleExpression),
                minCapacity: policy.minNodes,
                maxCapacity: policy.maxNodes,
                startTime: policy.startTime ? new Date(policy.startTime) : undefined,
                endTime: policy.endTime ? new Date(policy.endTime) : undefined,
            });
        });
    }
}
