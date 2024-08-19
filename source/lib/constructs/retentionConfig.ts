/* 
 Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 SPDX-License-Identifier: Apache-2.0
*/
import * as cdk from 'aws-cdk-lib';
import * as cr from 'aws-cdk-lib/custom-resources';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as path from 'path';
import * as lambdaNodejs from 'aws-cdk-lib/aws-lambda-nodejs';
import * as secretsmanager from 'aws-cdk-lib/aws-secretsmanager';

import { Construct, IConstruct } from 'constructs';
import { RetentionRule } from '../utils/types';
import { CUSTOM_RESOURCE_MAX_ATTEMPTS } from '../utils/constants';

export interface RetentionConfigProps {
    vpc: ec2.IVpc;
    retentionRules?: RetentionRule[];
    druidEndpoint: string;
    druidSystemUserSecret: secretsmanager.ISecret;
    dependency?: IConstruct;
}

export class RetentionConfig extends Construct {
    public constructor(scope: Construct, id: string, props: RetentionConfigProps) {
        super(scope, id);

        const onEventHandler = new lambdaNodejs.NodejsFunction(
            this,
            'retention-config-event-handler',
            {
                vpc: props.vpc,
                vpcSubnets: {
                    subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS,
                },
                entry: path.join(__dirname, '../lambdas/retentionConfigLambda.ts'),
                handler: 'onEventHandler',
                runtime: lambda.Runtime.NODEJS_18_X,
                environment: {
                    /* eslint-disable @typescript-eslint/naming-convention */
                    DRUID_ENDPOINT: props.druidEndpoint,
                    SYSTEM_USER_SECRET_ID: props.druidSystemUserSecret.secretArn,
                    NUM_OF_ATTEMPTS: CUSTOM_RESOURCE_MAX_ATTEMPTS.toString(),
                    /* eslint-enable @typescript-eslint/naming-convention */
                },
                timeout: cdk.Duration.minutes(15),
                description:
                    'Lambda onEventHandler for Druid data retention configuration',
            }
        );
        props.druidSystemUserSecret.grantRead(onEventHandler);

        const provider = new cr.Provider(this, 'Provider', {
            onEventHandler,
        });

        const { retentionRules } = props;

        const customResource = new cdk.CustomResource(
            this,
            'retention-config-custom-resource',
            {
                serviceToken: provider.serviceToken,
                properties: {
                    retentionRules,
                },
            }
        );
        if (props.dependency) {
            customResource.node.addDependency(props.dependency);
        }
    }
}
