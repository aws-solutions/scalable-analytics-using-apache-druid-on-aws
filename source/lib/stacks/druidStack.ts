/* 
 Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 SPDX-License-Identifier: Apache-2.0
*/
/* eslint-disable @typescript-eslint/naming-convention */
import * as acm from 'aws-cdk-lib/aws-certificatemanager';
import * as cdk from 'aws-cdk-lib';
import * as fs from 'fs';
import * as path from 'path';
import * as route53 from 'aws-cdk-lib/aws-route53';
import * as secretsmanager from 'aws-cdk-lib/aws-secretsmanager';
import * as synthetics from 'aws-cdk-lib/aws-synthetics';
import * as waf from 'aws-cdk-lib/aws-wafv2';
import * as ec2 from 'aws-cdk-lib/aws-ec2';

import { Construct, IConstruct } from 'constructs';

import { AppRegistry } from '../constructs/appRegistryAspect';
import { BaseInfrastructure } from '../constructs/baseInfrastructure';
import { DruidRolePermissionCreator } from '../constructs/druidRolePermissionCreator';
import { DruidStackProps } from '../utils/types';
import { VulnerabilityScan } from '../constructs/vulnerabilityScan';
import { rules } from '../constructs/awsManagedWebAclRules';
import { addCfnGuardSuppression } from '../constructs/cfnGuardHelper';

export abstract class DruidStack extends cdk.Stack {
    protected readonly baseInfra: BaseInfrastructure;
    protected readonly webAcl?: waf.CfnWebACL;
    protected readonly certificate?: acm.ICertificate;
    protected readonly hostedZone?: route53.IHostedZone;

    protected constructor(scope: Construct, id: string, props: DruidStackProps) {
        super(scope, id, props);

        this.baseInfra = new BaseInfrastructure(this, 'druid-base-infra', {
            vpcId: props.vpcId,
            vpcCidr: props.vpcId ? undefined : props.vpcCidr, // don't set cidr for byo vpc
            initBastion: props.initBastion,
            initInstallationBucket: props.initInstallationBucket,
            selfManageInstallationBucketAssets: props.selfManageInstallationBucketAssets,
            druidClusterName: props.clusterParams.druidClusterName,
            druidDeepStorageConfig: props.clusterParams.druidDeepStorageConfig,
            oidcIdpConfig: props.clusterParams.oidcIdpConfig,
            removalPolicy: props.removalPolicy,
            subnetMappings: props.subnetMappings,
            provisionS3Clear: props.provisionS3Clear,
        });

        if (props.clusterParams.internetFacing) {
            this.webAcl = new waf.CfnWebACL(this, 'web-acl', {
                defaultAction: { allow: {} },
                visibilityConfig: {
                    cloudWatchMetricsEnabled: true,
                    sampledRequestsEnabled: true,
                    metricName: `${props.stackName}-web-acl`,
                },
                scope: 'REGIONAL',
                rules: rules.map((x) => x.rule),
            });
        }

        if (props.route53Params) {
            if (!props.druidDomain) {
                throw new Error(
                    'Please configure the Druid domain when specifying Route53 parameters.'
                );
            }

            this.hostedZone = route53.HostedZone.fromHostedZoneAttributes(
                this,
                'hosted-zone',
                {
                    zoneName: props.route53Params.route53HostedZoneName,
                    hostedZoneId: props.route53Params.route53HostedZoneId,
                }
            );

            this.certificate = new acm.Certificate(this, 'alb-cert', {
                domainName: props.druidDomain,
                validation: acm.CertificateValidation.fromDns(this.hostedZone),
            });
        }

        if (props.tlsCertificateArn) {
            if (!props.druidDomain) {
                throw new Error(
                    'Please configure the Druid domain when specifying tlsCertficateArn.'
                );
            }
            this.certificate = acm.Certificate.fromCertificateArn(
                this,
                'alb-cert',
                props.tlsCertificateArn
            );
        }

        if (props.enableVulnerabilityScanJob) {
            // enable vulnerability scan cron job for fedramp/fips installations
            // using prettier-ignore prevents prettier from reformatting the nosonar line to the next line
            // prettier-ignore
            new VulnerabilityScan(this, 'vulnerability-scan', { // NOSONAR (typescript:S1848) - cdk construct is used
                druidVersion: props.clusterParams.druidVersion,
                removalPolicy: props.removalPolicy,
            });
        }

        cdk.Aspects.of(this).add(
            new AppRegistry(this, 'app-registry-aspect', {
                vpc: this.baseInfra.vpc,
                solutionId: props.solutionId,
                solutionVersion: props.solutionVersion,
                solutionName: props.solutionName,
                applicationName: `Apache-Druid-on-AWS-${props.clusterParams.druidClusterName}`,
                applicationType: 'AWS-Solutions',
            })
        );
    }

    protected createDefaultRoles(
        druidEndpoint: string,
        druidSystemUserSecret: secretsmanager.ISecret,
        groupRoleMappings: Record<string, string[]>,
        dependency?: IConstruct
    ): Construct {
        const cr = new DruidRolePermissionCreator(this, 'role-creator-cr', {
            vpc: this.baseInfra.vpc,
            druidEndpoint,
            druidSystemUserSecret,
            groupRoleMappings: groupRoleMappings,
            dependency,
        });

        return cr;
    }

    protected createCanary(druidEndpoint: string): synthetics.Canary {
        // Create the security group for the Lambda function
        const canarySecurityGroup = new ec2.SecurityGroup(this, 'canary-sg', {
            vpc: this.baseInfra.vpc,
            allowAllOutbound: true,
        });

        addCfnGuardSuppression(canarySecurityGroup, [
            {
                id: 'EC2_SECURITY_GROUP_EGRESS_OPEN_TO_WORLD_RULE',
                reason: 'Allowing to talk to Druid peers and download necessary dependencies from internet',
            },
            {
                id: 'SECURITY_GROUP_EGRESS_ALL_PROTOCOLS_RULE',
                reason: 'Allowing to talk to Druid peers and download necessary dependencies from internet',
            },
        ]);

        this.createEniDeleteLambda(canarySecurityGroup);
        return new synthetics.Canary(this, 'canary', {
            runtime: new synthetics.Runtime(
                'syn-nodejs-puppeteer-9.0',
                synthetics.RuntimeFamily.NODEJS
            ),
            vpc: this.baseInfra.vpc,
            vpcSubnets: { subnets: this.baseInfra.vpc.privateSubnets },
            securityGroups: [canarySecurityGroup],
            environmentVariables: { DRUID_ENDPOINT: druidEndpoint },
            test: synthetics.Test.custom({
                code: synthetics.Code.fromInline(
                    fs
                        .readFileSync(path.resolve(__dirname, '../lambdas/canary.js'))
                        .toString()
                ),
                handler: 'index.handler',
            }),
            schedule: synthetics.Schedule.rate(cdk.Duration.minutes(5)),
            cleanup: synthetics.Cleanup.LAMBDA,
        });
    }

    private createEniDeleteLambda(canarySecurityGroup: ec2.ISecurityGroup): void {
        // NOSONAR-start - The polling policy is required for the custom resource helper to work
        const s3ClearPollingPolicy = new cdk.aws_iam.Policy(
            this,
            's3ClearPollingPolicy',
            {
                statements: [
                    new cdk.aws_iam.PolicyStatement({
                        effect: cdk.aws_iam.Effect.ALLOW,
                        actions: [
                            'lambda:AddPermission',
                            'lambda:RemovePermission',
                            'events:PutRule',
                            'events:DeleteRule',
                            'events:PutTargets',
                            'events:RemoveTargets',
                        ],
                        resources: ['*'],
                    }),
                ],
            }
        );
        // NOSONAR-end

        const lambdaBasicExecutionPolicy = new cdk.aws_iam.Policy(
            this,
            'lambdaBasicExecutionPolicy',
            {
                statements: [
                    new cdk.aws_iam.PolicyStatement({
                        effect: cdk.aws_iam.Effect.ALLOW,
                        actions: [
                            'logs:CreateLogGroup',
                            'logs:CreateLogStream',
                            'logs:PutLogEvents',
                        ],
                        resources: ['*'],
                    }),
                ],
            }
        );

        const deleteEniPolicy = new cdk.aws_iam.Policy(this, 'deleteEniPolicy', {
            statements: [
                new cdk.aws_iam.PolicyStatement({
                    effect: cdk.aws_iam.Effect.ALLOW,
                    actions: [
                        'ec2:DeleteNetworkInterface',
                        'ec2:DescribeNetworkInterfaces',
                        'ec2:DescribeVpcEndpoints',
                        'ec2:DescribeRouteTables',
                        'ec2:DescribeSecurityGroups',
                        'ec2:DescribeNatGateways',
                        'ec2:DescribeAvailabilityZones',
                        'ec2:DescribeRegions',
                        'ec2:DescribeVpcs',
                        'ec2:DescribeVpcAttribute',
                        'ec2:DescribeSubnets',
                    ],
                    resources: ['*'],
                }),
            ],
        });

        const deleteEniLambdaRole = new cdk.aws_iam.Role(this, 'deleteEniLambdaRole', {
            assumedBy: new cdk.aws_iam.ServicePrincipal('lambda.amazonaws.com'),
            inlinePolicies: {
                s3ClearPollingPolicyDocument: s3ClearPollingPolicy.document,
                lambdaBasicExecutionPolicyDocument: lambdaBasicExecutionPolicy.document,
                deleteEniPolicyDocument: deleteEniPolicy.document,
            },
        });

        addCfnGuardSuppression(deleteEniLambdaRole, [
            {
                id: 'IAM_POLICYDOCUMENT_NO_WILDCARD_RESOURCE',
                reason: 'No resource name needed',
            },
        ]);

        const deleteEniLambdaFunction = new cdk.aws_lambda.Function(
            this,
            'deleteEniLambdaFunction',
            {
                runtime: cdk.aws_lambda.Runtime.PYTHON_3_12,
                handler: 'lambda_function.handler',
                description: 'This function deletes a given ENI',
                role: deleteEniLambdaRole,
                code: cdk.aws_lambda.Code.fromAsset('lib/lambdas/eni-delete'),
                timeout: cdk.Duration.minutes(5),
            }
        );

        addCfnGuardSuppression(deleteEniLambdaFunction, [
            {
                id: 'LAMBDA_CONCURRENCY_CHECK',
                reason: 'Lambda concurrency check is not needed',
            },
            {
                id: 'LAMBDA_INSIDE_VPC',
                reason: 'Lambda does not need to be inside VPC',
            },
        ]);

        // Create a custom resource that triggers the lambda function to delete the ENI
        const deleteEnis = new cdk.CustomResource(this, 'DeleteEnis', {
            serviceToken: deleteEniLambdaFunction.functionArn,
            properties: {
                securityGroups: [canarySecurityGroup.securityGroupId],
            },
        });

        deleteEnis.node.addDependency(this.baseInfra.vpc);
    }
}
