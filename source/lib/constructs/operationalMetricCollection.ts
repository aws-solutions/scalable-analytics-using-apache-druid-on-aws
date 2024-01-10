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
import * as cr from 'aws-cdk-lib/custom-resources';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as path from 'path';

import { Construct } from 'constructs';
import { CustomResource } from 'aws-cdk-lib';
import { NodejsFunction } from 'aws-cdk-lib/aws-lambda-nodejs';
import { addCfnNagSuppression } from './cfnNagSuppression';

export interface OperationalMetricsCollectionProps {
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
