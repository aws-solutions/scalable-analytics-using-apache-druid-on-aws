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
import * as acm from 'aws-cdk-lib/aws-certificatemanager';
import * as cdk from 'aws-cdk-lib';
import * as fs from 'fs';
import * as path from 'path';
import * as route53 from 'aws-cdk-lib/aws-route53';
import * as secretsmanager from 'aws-cdk-lib/aws-secretsmanager';
import * as synthetics from 'aws-cdk-lib/aws-synthetics';
import * as waf from 'aws-cdk-lib/aws-wafv2';

import { Construct, IConstruct } from 'constructs';

import { AppRegistry } from '../constructs/appRegistryAspect';
import { BaseInfrastructure } from '../constructs/baseInfrastructure';
import { DruidRolePermissionCreator } from '../constructs/druidRolePermissionCreator';
import { DruidStackProps } from '../utils/types';
import { VulnerabilityScan } from '../constructs/vulnerabilityScan';
import { rules } from '../constructs/awsManagedWebAclRules';

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
            druidClusterName: props.clusterParams.druidClusterName,
            druidDeepStorageConfig: props.clusterParams.druidDeepStorageConfig,
            oidcIdpConfig: props.clusterParams.oidcIdpConfig,
            removalPolicy: props.removalPolicy,
            subnetMappings: props.subnetMappings,
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
            new VulnerabilityScan(this, 'vulnerability-scan', {
                druidVersion: props.clusterParams.druidVersion,
                removalPolicy: props.removalPolicy,
            });
        }

        cdk.Aspects.of(this).add(
            new AppRegistry(this, 'app-registry-aspect', {
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
        return new synthetics.Canary(this, 'canary', {
            runtime: synthetics.Runtime.SYNTHETICS_NODEJS_PUPPETEER_5_1,
            vpc: this.baseInfra.vpc,
            vpcSubnets: { subnets: this.baseInfra.vpc.privateSubnets },
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
}
