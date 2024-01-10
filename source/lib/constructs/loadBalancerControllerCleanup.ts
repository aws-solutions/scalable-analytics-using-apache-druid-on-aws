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
import * as cr from 'aws-cdk-lib/custom-resources';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as lambda from 'aws-cdk-lib/aws-lambda';

import { Construct } from 'constructs';
import { CustomResource } from 'aws-cdk-lib';
import { NodejsFunction } from 'aws-cdk-lib/aws-lambda-nodejs';

import path = require('path');

interface LoadBalancerControllerCleanupProps {
    eksClusterId: string;
    druidDomain?: string;
    hostedZoneId?: string;
}

export class LoadBalancerControllerCleanup extends Construct {
    public constructor(
        scope: Construct,
        id: string,
        props: LoadBalancerControllerCleanupProps
    ) {
        super(scope, id);

        const fn = new NodejsFunction(this, 'load-balancer-controller-cleaner-fn', {
            entry: path.join(__dirname, './loadBalancerControllerCleanupLambda.ts'),
            handler: 'handler',
            description: 'Clean up dangling ALBs and Route53 on EKS cluster teardown',
            runtime: lambda.Runtime.NODEJS_18_X,
            initialPolicy: [
                new iam.PolicyStatement({
                    effect: iam.Effect.ALLOW,
                    actions: [
                        'elasticloadbalancing:DescribeLoadBalancers',
                        'ec2:DescribeSecurityGroups',
                        'elasticloadbalancing:DescribeTags',
                        'elasticloadbalancing:DeleteLoadBalancer',
                        'route53:ChangeResourceRecordSets',
                    ],
                    resources: ['*'],
                }),
            ],
        });

        const provider = new cr.Provider(this, 'Provider', {
            onEventHandler: fn,
        });

        new CustomResource(this, 'load-balancer-controller-cr', {
            serviceToken: provider.serviceToken,
            properties: {
                eksClusterId: props.eksClusterId,
                hostedZoneId: props.hostedZoneId,
                aRecordName: props.druidDomain,
            },
        });
    }
}
