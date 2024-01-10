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
import * as appInsights from 'aws-cdk-lib/aws-applicationinsights';
import * as appRegistry from '@aws-cdk/aws-servicecatalogappregistry-alpha';
import * as cdk from 'aws-cdk-lib';
import * as cr from 'aws-cdk-lib/custom-resources';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as path from 'path';

import { Construct, IConstruct } from 'constructs';

import { CfnResourceAssociation } from 'aws-cdk-lib/aws-servicecatalogappregistry';
import { NodejsFunction } from 'aws-cdk-lib/aws-lambda-nodejs';

/* eslint-disable @typescript-eslint/naming-convention */
const DEFAULT_APPLICATION_RESOURCE_GROUP_STATE_QUERY_TIMEOUT = cdk.Duration.minutes(5);
/* eslint-disable @typescript-eslint/naming-convention */
const DEFAULT_APPLICATION_RESOURCE_GROUP_STATE_QUERY_INTERVAL = cdk.Duration.seconds(1);

interface AppRegistryProps {
    solutionName: string;
    solutionId: string;
    solutionVersion: string;
    applicationType: string;
    applicationName: string;
}

export class AppRegistry extends Construct implements cdk.IAspect {
    private readonly application: appRegistry.Application;

    public constructor(
        scope: cdk.Stack,
        id: string,
        private readonly props: AppRegistryProps
    ) {
        super(scope, id);

        this.application = this.createAppForAppRegistry();
        this.createAttributeGroup(this.application);
        this.addTagsforApplication(this.application);
        const waiter = this.waitForResourceGroupCreated(this.application);

        this.createAppForAppInsights(this.application, waiter);
    }

    public visit(node: IConstruct): void {
        if (!(node instanceof cdk.Stack)) {
            return;
        }

        if (!node.nested) {
            // it's a root stack, associate the stack with the app, create attribute group and tag it
            this.application.associateApplicationWithStack(node);
        } else {
            new CfnResourceAssociation(node, 'AppRegistryAssociation', {
                application: this.application.applicationName!,
                resource: node.stackId,
                resourceType: 'CFN_STACK',
            }).addDependency(this.application.node.defaultChild as cdk.CfnResource);
        }
    }

    private createAppForAppRegistry(): appRegistry.Application {
        return new appRegistry.Application(this, 'RegistrySetup', {
            applicationName: cdk.Fn.join('-', [
                this.props.applicationName,
                cdk.Aws.REGION,
                cdk.Aws.ACCOUNT_ID,
            ]),
            description: `Service Catalog application to track and manage all your resources for the solution ${this.props.solutionName}`,
        });
    }

    private addTagsforApplication(application: appRegistry.Application): void {
        cdk.Tags.of(application).add('Solutions:SolutionID', this.props.solutionId);
        cdk.Tags.of(application).add('Solutions:SolutionName', this.props.solutionName);
        cdk.Tags.of(application).add(
            'Solutions:SolutionVersion',
            this.props.solutionVersion
        );
        cdk.Tags.of(application).add(
            'Solutions:ApplicationType',
            this.props.applicationType
        );
    }

    // The Resource Group is created by the Application asychronously.
    // The Application does not expose the resource group instance that we can use to set dependency which will cause the intermittent failure in AppInsight Application provision.
    // Add a waiter customer resource to ensure the Resource Group is CREATED.
    private waitForResourceGroupCreated(
        application: appRegistry.Application
    ): cdk.CustomResource {
        const lambdaPolicyStatement = new iam.PolicyStatement({
            actions: ['servicecatalog:GetApplication'],
            resources: [
                cdk.Arn.format(
                    {
                        service: 'servicecatalog',
                        resource: 'application',
                        resourceName: '*',
                    },
                    cdk.Stack.of(this)
                ),
                application.applicationArn,
            ],
        });

        const eventHandlerLambda = new NodejsFunction(this, 'event-handler-lambda', {
            entry: path.join(__dirname, '../lambdas/appRegistryWaiterLambda.ts'),
            handler: 'handler',
            description:
                'Lambda for checking the state of AppRegistry Application Resource Group state',
            initialPolicy: [lambdaPolicyStatement],
            runtime: lambda.Runtime.NODEJS_18_X,
        });

        const provider = new cr.Provider(this, 'provider', {
            onEventHandler: eventHandlerLambda,
            isCompleteHandler: eventHandlerLambda,
            queryInterval: DEFAULT_APPLICATION_RESOURCE_GROUP_STATE_QUERY_INTERVAL,
            totalTimeout: DEFAULT_APPLICATION_RESOURCE_GROUP_STATE_QUERY_TIMEOUT,
        });

        return new cdk.CustomResource(this, 'custom-resource', {
            serviceToken: provider.serviceToken,
            properties: {
                applicationId: application.applicationId,
                applicationName: application.applicationName,
            },
        });
    }

    private createAppForAppInsights(
        application: appRegistry.Application,
        waiter: cdk.CustomResource
    ): void {
        new appInsights.CfnApplication(this, 'app-insight-setup', {
            resourceGroupName: cdk.Fn.join('-', [
                'AWS_AppRegistry_Application',
                application.applicationName!,
            ]),
            autoConfigurationEnabled: true,
            cweMonitorEnabled: true,
            opsCenterEnabled: true,
        }).addDependency(waiter.node.defaultChild as cdk.CfnResource);
    }

    private createAttributeGroup(application: appRegistry.Application): void {
        new appRegistry.AttributeGroup(this, 'app-attributes', {
            attributeGroupName: cdk.Aws.STACK_NAME,
            description: 'Attributes for Solutions Metadata',
            attributes: {
                applicationType: this.props.applicationType,
                version: this.props.solutionVersion,
                solutionID: this.props.solutionId,
                solutionName: this.props.solutionName,
            },
        }).associateWith(application);
    }
}
