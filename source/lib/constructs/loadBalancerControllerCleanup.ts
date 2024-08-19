/* 
 Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 SPDX-License-Identifier: Apache-2.0
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

        // prettier-ignore
        new CustomResource(this, 'load-balancer-controller-cr', { // NOSONAR (typescript:S1848) - cdk construct is used
            serviceToken: provider.serviceToken,
            properties: {
                eksClusterId: props.eksClusterId,
                hostedZoneId: props.hostedZoneId,
                aRecordName: props.druidDomain,
            },
        });
    }
}
