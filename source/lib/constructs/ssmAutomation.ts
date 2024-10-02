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
/* eslint-disable @typescript-eslint/naming-convention */

import { Construct } from 'constructs';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as ssm from 'aws-cdk-lib/aws-ssm';
import * as cdk from 'aws-cdk-lib';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as events from 'aws-cdk-lib/aws-events';

import {
    HOST_TERMINATION_DOC_SUFFIX,
    INSTANCE_TERMINATION_TIMEOUT,
} from '../utils/constants';
import { addCfnNagSuppression } from './cfnNagSuppression';
import { DruidNodeType } from '../utils/types';

export interface SSMAutomationProps {
    nodeType: DruidNodeType;
    secretArn: string;
    serviceName: string;
    targetAutoScalingGroupArn: string;
    targetAutoScalingGroupName: string;
    ec2IamRole: iam.IRole;
    gracefulTerminationParamName: string;
    installationBucket: s3.IBucket;
}

export class SSMAutomation extends Construct {
    public constructor(scope: Construct, id: string, props: SSMAutomationProps) {
        super(scope, id);

        const ssmAutomationRole = this.createSSMAutomationRole(
            props.serviceName,
            props.targetAutoScalingGroupArn
        );
        const ssmAutomationDocument = this.createSSMAutomationDocument(
            props.nodeType,
            props.serviceName,
            props.secretArn,
            ssmAutomationRole,
            props.gracefulTerminationParamName,
            props.installationBucket
        );

        const eventAutomationStartRole = this.createEventAutomationStartRole(
            props.serviceName,
            ssmAutomationDocument,
            ssmAutomationRole
        );
        this.createEventBridgeRule(
            props.serviceName,
            eventAutomationStartRole,
            ssmAutomationDocument,
            props.targetAutoScalingGroupName
        );
    }

    private createSSMAutomationRole(
        serviceName: string,
        targetAutoScalingGroupArn: string
    ): iam.Role {
        const region = cdk.Aws.REGION;
        const policies = [
            new iam.PolicyStatement({
                resources: ['*'],
                effect: iam.Effect.ALLOW,
                actions: [
                    'ssm:UpdateInstanceInformation',
                    'ssm:DescribeInstanceInformation',
                    'ssm:DescribeInstanceProperties',
                    'ssm:DescribeDocumentParameters',
                    'ssm:ListCommands',
                    'ssm:ListCommandInvocations',
                ],
            }),
            new iam.PolicyStatement({
                resources: [`arn:aws:ssm:${region}::document/AWS-RunShellScript`],
                effect: iam.Effect.ALLOW,
                actions: ['ssm:SendCommand'],
            }),
            new iam.PolicyStatement({
                resources: [`arn:aws:ec2:${region}:*:instance/*`],
                effect: iam.Effect.ALLOW,
                actions: ['ssm:SendCommand'],
            }),
            new iam.PolicyStatement({
                resources: [targetAutoScalingGroupArn],
                effect: iam.Effect.ALLOW,
                actions: ['autoscaling:CompleteLifecycleAction'],
            }),
        ];
        const role = new iam.Role(this, `${serviceName}HostTerminationAutomationRole`, {
            assumedBy: new iam.ServicePrincipal('ssm.amazonaws.com'),
            inlinePolicies: {
                policyDocument: new iam.PolicyDocument({
                    statements: policies,
                }),
            },
        });
        addCfnNagSuppression(role, [
            {
                id: 'W11',
                reason: 'Resource * is required by SSM related permissions.',
            },
        ]);

        return role;
    }

    private createSSMAutomationDocument(
        nodeType: DruidNodeType,
        serviceName: string,
        secretArn: string,
        ssmAutomationRole: iam.Role,
        gracefulTerminationParamName: string,
        installationBucket: s3.IBucket
    ): ssm.CfnDocument {
        return new ssm.CfnDocument(this, `${serviceName}${HOST_TERMINATION_DOC_SUFFIX}`, {
            documentType: 'Automation',
            content: {
                schemaVersion: '0.3',
                description:
                    'This document will execute required steps for graceful instance termination',
                assumeRole: `${ssmAutomationRole.roleArn}`,
                parameters: {
                    ASGName: {
                        type: 'String',
                        description: 'AutoScaling Group Name',
                    },
                    InstanceId: {
                        type: 'String',
                        description: 'Instance Id',
                    },
                    LCHName: {
                        type: 'String',
                        description: 'Lifecycle Hook Name',
                    },
                },
                mainSteps: [
                    {
                        name: 'runTerminationScript',
                        action: 'aws:runCommand',
                        inputs: {
                            DocumentName: 'AWS-RunShellScript',
                            InstanceIds: ['{{InstanceId}}'],
                            CloudWatchOutputConfig: {
                                CloudWatchOutputEnabled: true,
                            },
                            Parameters: {
                                commands: [
                                    `export AWS_DEFAULT_REGION=${cdk.Aws.REGION}`,
                                    `sudo -u druid-cluster -E aws s3 cp s3://${installationBucket.bucketName}/scripts/druid/terminate_druid_node.sh /home/druid-cluster/apache-druid/scripts/druid/`,
                                    // The root priviledge is needed to terminate historial process using supervisorctl
                                    `sudo -u root -E bash /home/druid-cluster/apache-druid/scripts/druid/terminate_druid_node.sh ${nodeType} ${secretArn} ${gracefulTerminationParamName} | tee /home/druid-cluster/apache-druid/log/ssm_automation.log`,
                                ],
                                executionTimeout: `${INSTANCE_TERMINATION_TIMEOUT}`,
                            },
                        },
                    },
                    {
                        name: 'completeTermination',
                        action: 'aws:executeAwsApi',
                        inputs: {
                            LifecycleHookName: '{{ LCHName }}',
                            InstanceId: '{{ InstanceId }}',
                            AutoScalingGroupName: '{{ ASGName }}',
                            Service: 'autoscaling',
                            Api: 'CompleteLifecycleAction',
                            LifecycleActionResult: 'CONTINUE',
                        },
                    },
                ],
            },
        });
    }

    private createEventAutomationStartRole(
        serviceName: string,
        ssmAutomationDocument: ssm.CfnDocument,
        ssmAutomationRoleArn: iam.Role
    ): iam.Role {
        const policies = [
            new iam.PolicyStatement({
                resources: [
                    `arn:aws:ssm:${cdk.Aws.REGION}:${cdk.Aws.ACCOUNT_ID}:automation-definition/${ssmAutomationDocument.ref}:$DEFAULT`,
                ],
                effect: iam.Effect.ALLOW,
                actions: ['ssm:StartAutomationExecution'],
            }),
            new iam.PolicyStatement({
                resources: [ssmAutomationRoleArn.roleArn],
                effect: iam.Effect.ALLOW,
                actions: ['iam:PassRole'],
            }),
        ];
        return new iam.Role(this, `${serviceName}EventAutomationStartRole`, {
            assumedBy: new iam.ServicePrincipal('events.amazonaws.com'),
            inlinePolicies: {
                policyDocument: new iam.PolicyDocument({
                    statements: policies,
                }),
            },
        });
    }

    private createEventBridgeRule(
        serviceName: string,
        eventAutomationStartRole: iam.Role,
        ssmAutomationDocument: ssm.CfnDocument,
        targetAutoScalingGroupName: string
    ): events.CfnRule {
        return new events.CfnRule(this, `${serviceName}-EC2TerminationEventRule`, {
            description: 'Event to trigger SSM to run document when hosts are terminated',
            state: 'ENABLED',
            eventPattern: {
                source: ['aws.autoscaling'],
                // eslint-disable-next-line @typescript-eslint/naming-convention
                'detail-type': ['EC2 Instance-terminate Lifecycle Action'],
                detail: {
                    // eslint-disable-next-line @typescript-eslint/naming-convention
                    AutoScalingGroupName: [targetAutoScalingGroupName],
                },
            },
            roleArn: eventAutomationStartRole.roleArn,
            targets: [
                {
                    id: 'instanceTerminationTarget',
                    arn: `arn:aws:ssm:${cdk.Aws.REGION}:${cdk.Aws.ACCOUNT_ID}:automation-definition/${ssmAutomationDocument.ref}:$DEFAULT`,
                    roleArn: eventAutomationStartRole.roleArn,
                    inputTransformer: {
                        inputPathsMap: {
                            asgname: '$.detail.AutoScalingGroupName',
                            instanceid: '$.detail.EC2InstanceId',
                            lchname: '$.detail.LifecycleHookName',
                        },
                        inputTemplate:
                            '{"InstanceId":[<instanceid>],"ASGName":[<asgname>],"LCHName":[<lchname>]}',
                    },
                },
            ],
        });
    }
}
