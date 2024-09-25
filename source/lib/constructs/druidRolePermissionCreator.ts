/* 
 Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 SPDX-License-Identifier: Apache-2.0
*/
import * as cdk from 'aws-cdk-lib';
import * as cr from 'aws-cdk-lib/custom-resources';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as lambdaNodejs from 'aws-cdk-lib/aws-lambda-nodejs';
import * as path from 'path';
import * as secretsmanager from 'aws-cdk-lib/aws-secretsmanager';

import { Construct, IConstruct } from 'constructs';
import { CUSTOM_RESOURCE_MAX_ATTEMPTS } from '../utils/constants';

interface DruidRolePermissionCreatorProps {
    vpc: ec2.IVpc;
    druidEndpoint: string;
    druidSystemUserSecret: secretsmanager.ISecret;
    groupRoleMappings?: Record<string, string[]>;
    dependency?: IConstruct;
}
export class DruidRolePermissionCreator extends Construct {
    public constructor(
        scope: Construct,
        id: string,
        props: DruidRolePermissionCreatorProps
    ) {
        super(scope, id);

        const handler = new lambdaNodejs.NodejsFunction(this, 'role-creation-handler', {
            vpc: props.vpc,
            vpcSubnets: { subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS },
            entry: path.join(__dirname, '../lambdas/roleCreationLambda.ts'),
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
            description: 'Create default Druid roles and permissions',
        });

        props.druidSystemUserSecret.grantRead(handler);

        const provider = new cr.Provider(this, 'Provider', {
            onEventHandler: handler,
        });

        const customResource = new cdk.CustomResource(
            this,
            'role-creation-custom-resource',
            {
                serviceToken: provider.serviceToken,
                properties: {
                    groupRoleMappings: props.groupRoleMappings,
                },
            }
        );
        if (props.dependency) {
            customResource.node.addDependency(props.dependency);
        }
    }
}
