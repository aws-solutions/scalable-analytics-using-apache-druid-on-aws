/* 
 Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 SPDX-License-Identifier: Apache-2.0
*/
import * as cdk from 'aws-cdk-lib';
import * as cr from 'aws-cdk-lib/custom-resources';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as path from 'path';

import { Construct } from 'constructs';
import { CustomResource } from 'aws-cdk-lib';
import { NodejsFunction } from 'aws-cdk-lib/aws-lambda-nodejs';
import { addCfnNagSuppression } from './cfnNagSuppression';

export interface OperationalMetricsCollectionProps {
    vpc: ec2.IVpc;
    awsSolutionId: string;
    awsSolutionVersion: string;
    retainData: boolean;
    hostingPlatform: 'EC2' | 'EKS' | 'EKS-Fargate' | 'ECS';
    internetFacing: boolean;
    druidVersion: string;
}

export class OperationalMetricsCollection extends Construct {
    public readonly anonymousDataUUID: string;
    public readonly sendAnonymousData: string;

    public constructor(
        scope: Construct,
        id: string,
        props: OperationalMetricsCollectionProps
    ) {
        super(scope, id);

        const fn = new NodejsFunction(this, 'operational-metrics-handler', {
            vpc: props.vpc,
            vpcSubnets: {
                subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS,
            },
            entry: path.join(__dirname, './operationMetricCollectionLambda.ts'),
            handler: 'handler',
            description: 'Lambda for Operational Metrics collection',
            runtime: lambda.Runtime.NODEJS_18_X,
        });

        addCfnNagSuppression(fn, [
            {
                id: 'W58',
                reason: 'This Lambda function has permission to write CloudWatch Logs',
            },
            {
                id: 'W89',
                reason: 'This Lambda function does not need to deploy inside a VPC',
            },
            {
                id: 'W92',
                reason: 'This Lambda function does not need to reserve concurrency',
            },
        ]);

        const provider = new cr.Provider(this, 'Provider', {
            onEventHandler: fn,
        });

        const {
            awsSolutionId,
            awsSolutionVersion,
            retainData,
            hostingPlatform,
            internetFacing,
            druidVersion,
        } = props;
        const customResource = new CustomResource(
            this,
            'operational-metrics-custom-resource',
            {
                serviceToken: provider.serviceToken,
                properties: {
                    awsSolutionId,
                    awsSolutionVersion,
                    awsRegion: cdk.Aws.REGION,
                    retainData,
                    hostingPlatform,
                    internetFacing,
                    druidVersion,
                },
            }
        );

        this.anonymousDataUUID = customResource.getAttString('anonymousDataUUID');
    }
}
