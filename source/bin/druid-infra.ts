#!/usr/bin/env node
/* 
 Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 SPDX-License-Identifier: Apache-2.0
*/

import 'source-map-support/register';

import * as cdk from 'aws-cdk-lib';
import * as fs from 'fs';

import {
    DEFAULT_NUM_HTTP_CONNECTIONS,
    ZOOKEEPER_DEFAULT_VERSION,
} from '../lib/utils/constants';
import { DruidConfig, StatsdEmitterConfig } from '../lib/utils/types';

import Ajv from 'ajv';
import { CfnNagResourcePathRulesSuppressionAspect } from '../lib/constructs/cfnNagSuppression';
import { DruidEc2Stack } from '../lib/stacks/druidEc2Stack';
import { DruidEksStack } from '../lib/stacks/druidEksStack';
import { LambdaAspect } from '../lib/constructs/lambdaAspect';
import { configScheme } from '../lib/constructs/configScheme';

import { CfnGuardResourcePathRulesSuppressionAspect } from '../lib/constructs/cfnGuardHelper';

const solutionId = 'SO0262';
const solutionName = 'Scalable Analytics using Apache Druid on AWS';
const solutionVersion = 'v1.0.7';

const fipsEnabledRegions = [
    'us-east-1',
    'us-east-2',
    'us-west-1',
    'us-west-2',
    'us-gov-east-1',
    'us-gov-west-1',
    'ca-central-1',
];

const app = new cdk.App();

const account = app.node.tryGetContext('account') || process.env['CDK_DEFAULT_ACCOUNT'];
const region = app.node.tryGetContext('region') || process.env['CDK_DEFAULT_REGION'];

const contextKeys: (keyof DruidConfig)[] = [
    'vpcCidr',
    'vpcId',
    'customAmi',
    'subnetMappings',
    'route53HostedZoneId',
    'route53HostedZoneName',
    'druidDomain',
    'tlsCertificateArn',
    'internetFacing',
    'useFipsEndpoint',
    'bastionHost',
    'retainData',
    'enableVulnerabilityScanJob',
    'environmentAgnostic',
    'druidClusterName',
    'druidVersion',
    'zookeeperVersion',
    'druidOperationPlatform',
    'druidEc2Config',
    'druidEksConfig',
    'druidExtensions',
    'druidMetadataStoreConfig',
    'druidDeepStorageConfig',
    'druidCommonRuntimeConfig',
    'oidcIdpConfig',
    'druidEmitterConfig',
    'druidRetentionRules',
    'druidConcurrentQueryLimit',
    'druidInstanceIamPolicyArns',
    'tags',
    'additionalTags',
    'selfManageInstallationBucketAssets',
];

const configMap: Record<string, unknown> = {};
for (const key of contextKeys) {
    configMap[key] = app.node.tryGetContext(key);
}

const ajv = new Ajv({
    allowMatchingProperties: true,
});
const validate = ajv.compile(configScheme);
if (!validate(configMap)) {
    throw new Error(`Invalid config: ${JSON.stringify(validate.errors)}`);
}

const druidConfig = Object.assign({}, configMap) as unknown as DruidConfig;

const oidcIdpConfig = druidConfig.oidcIdpConfig;
if (oidcIdpConfig) {
    const discoveryUriSuffix = '.well-known/openid-configuration';
    if (!oidcIdpConfig.discoveryURI.endsWith(discoveryUriSuffix)) {
        if (oidcIdpConfig.discoveryURI.endsWith('/')) {
            oidcIdpConfig.discoveryURI = `${oidcIdpConfig.discoveryURI}${discoveryUriSuffix}`;
        } else {
            oidcIdpConfig.discoveryURI = `${oidcIdpConfig.discoveryURI}/${discoveryUriSuffix}`;
        }
    }
}

if (druidConfig.druidEmitterConfig?.emitterType === 'statsd') {
    const emitterConfig = druidConfig.druidEmitterConfig
        .emitterConfig as StatsdEmitterConfig;
    if (!emitterConfig.dogstatsdConstantTags) {
        emitterConfig.dogstatsdConstantTags = [
            `cluster_name:${druidConfig.druidClusterName}`,
        ];
    }
    if (!druidConfig.druidExtensions.includes('statsd-emitter')) {
        throw new Error(
            'To use the StatsD emitter, please add statsd-emitter extension to the extension list.'
        );
    }
}

if (druidConfig.useFipsEndpoint && !fipsEnabledRegions.includes(region.toLowerCase())) {
    throw new Error(
        `FIPS endpoints are only availble in ${fipsEnabledRegions
            .map((x) => x)
            .join(', ')}. The selected region: ${region} is not supported.`
    );
}

const solutionTags = {
    ...druidConfig.tags,
    ...druidConfig.additionalTags,
    solution: solutionName,
    solutionId,
    solutionVersion,
    druidClusterName: druidConfig.druidClusterName,
};
Object.entries(solutionTags).forEach(([key, value]) => {
    cdk.Tags.of(app).add(key, value);
});

const commonStackProps = {
    vpcId: druidConfig.vpcId,
    vpcCidr: druidConfig.vpcCidr,
    initBastion: druidConfig.bastionHost ?? false,
    route53Params:
        druidConfig.route53HostedZoneId && druidConfig.route53HostedZoneName
            ? {
                  route53HostedZoneId: druidConfig.route53HostedZoneId,
                  route53HostedZoneName: druidConfig.route53HostedZoneName,
              }
            : undefined,
    druidDomain: druidConfig.druidDomain,
    tlsCertificateArn: druidConfig.tlsCertificateArn,
    removalPolicy:
        druidConfig.retainData === false
            ? cdk.RemovalPolicy.DESTROY
            : cdk.RemovalPolicy.RETAIN,
    solutionId,
    solutionName,
    solutionVersion,
    solutionTags,
    customAmi: druidConfig.customAmi,
    subnetMappings: druidConfig.subnetMappings,
    enableVulnerabilityScanJob: druidConfig.enableVulnerabilityScanJob ?? false,
    selfManageInstallationBucketAssets:
        druidConfig.selfManageInstallationBucketAssets ?? false,
    provisionS3Clear: druidConfig.retainData === false,
    ...(!druidConfig.environmentAgnostic && { env: { account, region } }),
};

const mustHaveExtensions = [
    'druid-oidc',
    'druid-cloudwatch',
    'druid-basic-security',
    'druid-s3-extensions',
    'postgresql-metadata-storage',
];

if (druidConfig.druidOperationPlatform === 'ec2') {
    // TLS encryption is only supported on EC2 hosting
    mustHaveExtensions.push('simple-client-sslcontext');
}

const commonDruidClusterParams = {
    zookeeperVersion: druidConfig.zookeeperVersion ?? ZOOKEEPER_DEFAULT_VERSION,
    druidVersion: druidConfig.druidVersion,
    druidExtensions: Array.from(
        new Set([...mustHaveExtensions, ...druidConfig.druidExtensions])
    ),
    druidMetadataStoreConfig: druidConfig.druidMetadataStoreConfig,
    druidDeepStorageConfig: druidConfig.druidDeepStorageConfig,
    druidCommonRuntimeConfig: druidConfig.druidCommonRuntimeConfig,
    druidClusterName: druidConfig.druidClusterName,
    oidcIdpConfig: druidConfig.oidcIdpConfig,
    druidEmitterConfig: druidConfig.druidEmitterConfig ?? {
        emitterType: 'cloudwatch',
    },
    internetFacing: druidConfig.internetFacing ?? true,
    enableFipsEndpoints: druidConfig.useFipsEndpoint ?? false,
    druidRetentionRules: druidConfig.druidRetentionRules,
    druidConcurrentQueryLimit:
        druidConfig.druidConcurrentQueryLimit ?? DEFAULT_NUM_HTTP_CONNECTIONS,
    druidInstanceIamPolicyArns: druidConfig.druidInstanceIamPolicyArns,
};

switch (druidConfig.druidOperationPlatform) {
    case 'ec2':
        if (!druidConfig.druidEc2Config) {
            throw new Error(
                'The druid EC2 configuration is invalid. Please configure druidEc2Config for EC2 instances.'
            );
        }

        if (
            !fs.existsSync(
                `druid-bin/apache-druid-${druidConfig.druidVersion}-bin.tar.gz`
            ) ||
            !fs.existsSync(
                `zookeeper-bin/apache-zookeeper-${
                    druidConfig.zookeeperVersion ?? ZOOKEEPER_DEFAULT_VERSION
                }-bin.tar.gz`
            )
        ) {
            throw new Error(
                `The build process has not been run. Please run "npm run build" in the source directory of the project.`
            );
        }

        // using prettier-ignore prevents prettier from reformatting the nosonar line to the next line
        // prettier-ignore
        new DruidEc2Stack(app, `DruidEc2Stack-${druidConfig.druidClusterName}`, { // NOSONAR (typescript:S1848) - cdk construct is used
            ...commonStackProps,
            initInstallationBucket: true,
            clusterParams: {
                ...commonDruidClusterParams,
                hostingConfig: druidConfig.druidEc2Config,
            },
            description: `(${solutionId}) - ${solutionName}. Version ${solutionVersion}`,
        });
        break;
    case 'eks':
        if (!druidConfig.druidEksConfig) {
            throw new Error(
                'Invalid EKS cluster configuration. Please configure druidEksConfig for EKS cluster.'
            );
        }

        // prettier-ignore
        new DruidEksStack(app, `DruidEksStack-${druidConfig.druidClusterName}`, { // NOSONAR (typescript:S1848) - cdk construct is used
            ...commonStackProps,
            clusterParams: {
                ...commonDruidClusterParams,
                hostingConfig: druidConfig.druidEksConfig,
            },
            description: `(${solutionId}) - ${solutionName}. Version ${solutionVersion}`,
        });
        break;
    case 'ecs':
    default:
        throw new Error(
            `${druidConfig.druidOperationPlatform} is currently not supported`
        );
}

cdk.Aspects.of(app).add(
    new CfnGuardResourcePathRulesSuppressionAspect({
        /* eslint-disable @typescript-eslint/naming-convention */
        '/app-registry-aspect/provider/waiter-state-machine/LogGroup/Resource': [
            { id: 'CLOUDWATCH_LOG_GROUP_ENCRYPTED', reason: 'Custom Resource' },
        ],

        /* eslint-disable @typescript-eslint/naming-convention */
        '/canary/ServiceRole/Resource': [
            {
                id: 'IAM_NO_INLINE_POLICY_CHECK',
                reason: 'Default IAM policy implicitly generated by CDK',
            },
        ],

        /* eslint-disable @typescript-eslint/naming-convention */
        '/Custom::SyntheticsAutoDeleteUnderlyingResourcesCustomResourceProvider/Role': [
            {
                id: 'IAM_NO_INLINE_POLICY_CHECK',
                reason: 'Default IAM policy implicitly generated by CDK',
            },
        ],
    })
);

cdk.Aspects.of(app).add(
    new CfnNagResourcePathRulesSuppressionAspect({
        /* eslint-disable @typescript-eslint/naming-convention */
        '/[pP]rovider/framework-onEvent/Resource$': [
            {
                id: 'W58',
                reason: CfnNagResourcePathRulesSuppressionAspect.W58_REASON,
            },
            {
                id: 'W89',
                reason: CfnNagResourcePathRulesSuppressionAspect.W89_REASON,
            },
            {
                id: 'W92',
                reason: 'Custom resource lambda function is created by CDK and CloudFormation',
            },
        ],
        '/SecurityGroup/Resource': [
            {
                id: 'W40',
                reason: 'This project requires to download installation files from internet and S3',
            },
            {
                id: 'W5',
                reason: 'This project requires to download installation files from internet and S3',
            },
        ],
        '/EfsSecurityGroup/Resource': [
            {
                id: 'W40',
                reason: 'This project requires to download installation files from internet and S3',
            },
            {
                id: 'W5',
                reason: 'This project requires to download installation files from internet and S3',
            },
        ],
        '/Custom::CDKBucketDeployment[0-9A-Za-z]+/Resource$': [
            {
                id: 'W58',
                reason: CfnNagResourcePathRulesSuppressionAspect.W58_REASON,
            },
            {
                id: 'W89',
                reason: CfnNagResourcePathRulesSuppressionAspect.W89_REASON,
            },
            {
                id: 'W92',
                reason: CfnNagResourcePathRulesSuppressionAspect.W92_REASON,
            },
        ],
        '/Custom::CDKBucketDeployment[0-9A-Za-z]+/ServiceRole/DefaultPolicy/Resource$': [
            {
                id: 'W12',
                reason: 'Default IAM policy implicitly generated by CDKBucketDeployment.',
            },
        ],
        '/druid-vpc/inner-vpc/PublicSubnetSubnet[0-9]+/Subnet$': [
            {
                id: 'W33',
                reason: 'Public IP address assignment is needed for bastion host launched in the public subnet',
            },
        ],
        '/canary/ServiceRole/Resource': [
            {
                id: 'W11',
                reason: 'Default IAM policy implicitly generated by CDK',
            },
        ],
        '/Custom::SyntheticsAutoDeleteUnderlyingResourcesCustomResourceProvider/Role': [
            {
                id: 'W11',
                reason: 'Default IAM policy implicitly generated by CDK',
            },
        ],
        '/app-registry-aspect/event-handler-lambda/Resource': [
            {
                id: 'W58',
                reason: CfnNagResourcePathRulesSuppressionAspect.W58_REASON,
            },
            {
                id: 'W89',
                reason: CfnNagResourcePathRulesSuppressionAspect.W89_REASON,
            },
            {
                id: 'W92',
                reason: CfnNagResourcePathRulesSuppressionAspect.W92_REASON,
            },
        ],
        '/app-registry-aspect/provider/framework-[a-zA-Z]+/Resource$': [
            {
                id: 'W58',
                reason: CfnNagResourcePathRulesSuppressionAspect.W58_REASON,
            },
            {
                id: 'W89',
                reason: CfnNagResourcePathRulesSuppressionAspect.W89_REASON,
            },
            {
                id: 'W92',
                reason: CfnNagResourcePathRulesSuppressionAspect.W92_REASON,
            },
        ],
        '/internal-certificate-authority/tls-generator-handler/Resource': [
            {
                id: 'W58',
                reason: CfnNagResourcePathRulesSuppressionAspect.W58_REASON,
            },
            {
                id: 'W89',
                reason: CfnNagResourcePathRulesSuppressionAspect.W89_REASON,
            },
            {
                id: 'W92',
                reason: CfnNagResourcePathRulesSuppressionAspect.W92_REASON,
            },
        ],
        '/Custom::SyntheticsAutoDeleteUnderlyingResourcesCustomResourceProvider/Handler':
            [
                {
                    id: 'W58',
                    reason: CfnNagResourcePathRulesSuppressionAspect.W58_REASON,
                },
                {
                    id: 'W89',
                    reason: CfnNagResourcePathRulesSuppressionAspect.W89_REASON,
                },
                {
                    id: 'W92',
                    reason: CfnNagResourcePathRulesSuppressionAspect.W92_REASON,
                },
            ],
        '/canary/ArtifactsBucket/Resource': [
            {
                id: 'W35',
                reason: 'This S3 bucket is implicitly created by synthetics',
            },
        ],

        /* eslint-enable @typescript-eslint/naming-convention */
    })
);
cdk.Aspects.of(app).add(
    new LambdaAspect({
        solutionId,
        solutionVersion,
        useFipsEndpoint: druidConfig.useFipsEndpoint ?? false,
    })
);
