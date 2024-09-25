/* 
 Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 SPDX-License-Identifier: Apache-2.0
*/

import * as as from 'aws-cdk-lib/aws-autoscaling';
import * as cdk from 'aws-cdk-lib';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import * as fs from 'fs';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as utils from '../utils/utils';

import {
    CustomAmi,
    DruidClusterParameters,
    DruidNodeType,
    Ec2Config,
} from '../utils/types';

import { BaseInfrastructure } from './baseInfrastructure';
import { Construct } from 'constructs';
import { ROLLING_UPDATE_PAUSE_TIME } from '../utils/constants';
import { addCfnNagSuppression } from './cfnNagSuppression';

export interface ZooKeeperProps {
    readonly clusterParams: DruidClusterParameters;
    readonly baseInfra: BaseInfrastructure;
    readonly clusterSecurityGroup: ec2.ISecurityGroup;
    readonly customAmi?: CustomAmi;
}

export class ZooKeeper extends Construct {
    public readonly zookeeperASGs: as.AutoScalingGroup[] = [];
    public readonly zookeeperConnectionString: string;

    public constructor(scope: Construct, id: string, props: ZooKeeperProps) {
        super(scope, id);

        const vpc = props.baseInfra.vpc;
        const zookeeperInstanceRole = this.createInstanceRole(
            props.baseInfra.installationBucket,
            props.clusterParams.druidInstanceIamPolicyArns
        );
        // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
        const zookeeperInstanceConfig = (props.clusterParams.hostingConfig as Ec2Config)[
            DruidNodeType.ZOOKEEPER
        ]!;
        const zookeeperInstanceTypeInfo = utils.getInstanceTypeInfo(
            zookeeperInstanceConfig.instanceType
        );
        const zookeeperCount = zookeeperInstanceConfig.minNodes;

        const privateSubnetIds: string[] = [];
        vpc.privateSubnets.forEach((subnet) => {
            privateSubnetIds.push(subnet.subnetId);
        });

        const zookeeperEnis: ec2.CfnNetworkInterface[] = [];
        for (let i = 0; i < zookeeperCount; i++) {
            const eni = new ec2.CfnNetworkInterface(
                this,
                `ZooKeeper-NetworkInterface${i}`,
                {
                    groupSet: [props.clusterSecurityGroup.securityGroupId],
                    subnetId: privateSubnetIds[i % privateSubnetIds.length],
                    description: `ZooKeeperNode${i + 1}`,
                }
            );
            zookeeperEnis.push(eni);
        }

        const zookeeperPrivateIps: string[] = [];
        zookeeperEnis.forEach((eni) => {
            zookeeperPrivateIps.push(eni.attrPrimaryPrivateIpAddress);
        });

        let previousAsg: as.AutoScalingGroup | undefined = undefined;

        for (let i = 0; i < zookeeperCount; i++) {
            const newAsg = new as.AutoScalingGroup(scope, `ZooKeeper-asg-${i + 1}`, {
                vpc,
                minCapacity: 1,
                maxCapacity: 1,
                launchTemplate: utils.createLaunchTemplate(
                    this,
                    `${DruidNodeType.ZOOKEEPER}-launch-template-${i + 1}`,
                    props.clusterSecurityGroup,
                    zookeeperInstanceRole,
                    zookeeperInstanceConfig,
                    props.customAmi
                ),
                vpcSubnets: {
                    subnets: [vpc.privateSubnets[i % vpc.privateSubnets.length]],
                },
                updatePolicy: as.UpdatePolicy.rollingUpdate({
                    maxBatchSize:
                        zookeeperInstanceConfig.rollingUpdatePolicy?.maxBatchSize,
                }),
                signals: as.Signals.waitForAll({
                    timeout: cdk.Duration.minutes(ROLLING_UPDATE_PAUSE_TIME),
                }),
            });

            const serverId = (i + 1).toString();
            const zookeeperNodeId = `ZooKeeperNode${serverId}`;
            utils.addNameTag(newAsg, zookeeperNodeId);
            cdk.Tags.of(newAsg).add('ZooKeeperNodeId', zookeeperNodeId);

            const zookeeperServers: string[] = new Array(zookeeperCount).fill(null).map(
                // eslint-disable-next-line @typescript-eslint/naming-convention
                (_, idx) => `server.${idx + 1}=${zookeeperPrivateIps[idx]}:2888:3888`
            );

            const formattedZooKeeperServers: string[] = new Array(zookeeperCount)
                .fill(null)
                // eslint-disable-next-line @typescript-eslint/naming-convention
                .map((_, idx) => `${zookeeperPrivateIps[idx]}:2181`);
            this.zookeeperConnectionString = formattedZooKeeperServers.join(',');

            if (previousAsg) {
                newAsg.node.addDependency(previousAsg);
            }

            const userData = fs
                .readFileSync('lib/config/user_data/zookeeper_user_data', 'utf-8')
                .toString()
                .replace(/{{REGION}}/g, cdk.Aws.REGION)
                .replace(
                    /{{S3_INSTALLATION_BUCKET}}/g,
                    props.baseInfra.installationBucket.bucketName
                )
                .replace(/{{DRUID_CLUSTER_NAME}}/g, props.clusterParams.druidClusterName)
                .replace(/{{ZK_COUNT}}/g, zookeeperCount.toString())
                .replace(/{{ZK_NODE_ID}}/g, zookeeperNodeId)
                .replace(/{{ZK_MY_ID}}/g, serverId)
                .replace(/{{ZK_VERSION}}/g, props.clusterParams.zookeeperVersion)
                .replace(/{{ZK_SERVERS}}/g, zookeeperServers.join('\n'))
                .replace(/{{STACK_ID}}/g, cdk.Aws.STACK_ID)
                .replace(
                    /{{USE_FIPS_ENDPOINT}}/g,
                    props.clusterParams.enableFipsEndpoints ? 'true' : 'false'
                )
                .replace(
                    /{{ZK_CONFIG_VERSION}}/g,
                    fs.readFileSync('lib/uploads/config/zk_version.txt').toString()
                )
                .replace(/{{STACK_NAME}}/g, cdk.Aws.STACK_NAME)
                .replace(
                    /{{RESOURCE_NAME}}/g,
                    (newAsg.node.defaultChild as as.CfnAutoScalingGroup).logicalId
                )
                .replace(
                    /{{CPU_ARCHITECTURE}}/g,
                    zookeeperInstanceTypeInfo.arch.toString() === 'arm64'
                        ? 'arm64'
                        : 'amd64'
                );
            newAsg.addUserData(userData);

            this.zookeeperASGs.push(newAsg);
            previousAsg = newAsg;
        }
    }

    private createInstanceRole(
        installationBucket: s3.IBucket,
        customPolicyArns?: string[]
    ): iam.IRole {
        const role = new iam.Role(this, 'ZooKeeperInstanceRole', {
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
                actions: ['s3:Get*', 's3:HeadObject', 's3:List*'],
                resources: [
                    installationBucket.bucketArn,
                    `${installationBucket.bucketArn}/*`,
                ],
            })
        );
        role.addToPrincipalPolicy(
            new iam.PolicyStatement({
                effect: iam.Effect.ALLOW,
                actions: [
                    'ec2:Describe*',
                    'ec2:CreateTags',
                    'ec2:AttachNetworkInterface',
                    'ec2:DetachNetworkInterface',
                    'autoscaling:Describe*',
                    'logs:PutRetentionPolicy',
                    'cloudwatch:PutMetricData',
                    'cloudformation:DescribeStackResource',
                    'cloudformation:SignalResource',
                    'logs:CreateLogGroup',
                    'logs:CreateLogStream',
                    'logs:PutLogEvents',
                    'logs:DescribeLogStreams',
                    'logs:DescribeLogGroups',
                    'logs:PutRetentionPolicy',
                ],
                resources: ['*'],
            })
        );

        customPolicyArns?.forEach((policy, index) => {
            role.addManagedPolicy(
                iam.ManagedPolicy.fromManagedPolicyArn(
                    this,
                    `druid-instance-custom-policy-${index}`,
                    policy
                )
            );
        });

        addCfnNagSuppression(
            role,
            [
                {
                    id: 'W12',
                    reason: 'Resource * is required for autoscaling and logs related permissions',
                },
            ],
            'DefaultPolicy'
        );

        return role;
    }
}
