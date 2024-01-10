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
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import * as kms from 'aws-cdk-lib/aws-kms';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as secretsmanager from 'aws-cdk-lib/aws-secretsmanager';
import * as sns from 'aws-cdk-lib/aws-sns';

import { BucketDeployment, Source } from 'aws-cdk-lib/aws-s3-deployment';
import {
    CONFIG_FOLDER,
    DRUID_IMAGE_FOLDER,
    EXTENSIONS_FOLDER,
    S3_ACCESS_LOGS_PREFIX,
    SCRIPTS_FOLDER,
    VPC_FLOW_LOGS_PREFIX,
    ZOOKEEPER_IMAGE_FOLDER,
} from '../utils/constants';
import { DruidDeepStorageConfig, OidcIdpConfig, SubnetMapping } from '../utils/types';

import { Construct } from 'constructs';
import { DruidVpc } from './druidVpc';
import { addCfnNagSuppression } from './cfnNagSuppression';

export interface BaseInfrastructureProps {
    readonly vpcId?: string;
    readonly vpcCidr?: string;
    readonly initBastion?: boolean;
    readonly initInstallationBucket?: boolean;
    readonly druidClusterName: string;
    readonly druidDeepStorageConfig?: DruidDeepStorageConfig;
    readonly oidcIdpConfig?: OidcIdpConfig;
    readonly removalPolicy: cdk.RemovalPolicy;
    readonly subnetMappings?: SubnetMapping;
}

export class BaseInfrastructure extends Construct {
    public readonly vpc: ec2.IVpc;
    public readonly bastion?: ec2.BastionHostLinux;
    public readonly deepStorageEncryptionKey?: kms.IKey;
    public readonly deepStorageBucket: s3.IBucket;
    public readonly installationBucket: s3.IBucket;
    public readonly serverAccessLogsBucket: s3.IBucket;
    public readonly druidImageDeployment?: BucketDeployment;
    public readonly zookeeperImageDeployment?: BucketDeployment;
    public readonly oidcIdpClientSecret?: secretsmanager.ISecret;
    public readonly snsTopic: sns.ITopic;

    public constructor(scope: Construct, id: string, props: BaseInfrastructureProps) {
        super(scope, id);

        const commonS3BucketProperties = {
            blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
            versioned: true,
            enforceSSL: true,
            removalPolicy: props.removalPolicy,
        };

        this.serverAccessLogsBucket = new s3.Bucket(this, 'server-access-logs-bucket', {
            ...commonS3BucketProperties,
            encryption: s3.BucketEncryption.S3_MANAGED,
        });
        addCfnNagSuppression(this.serverAccessLogsBucket, [
            {
                id: 'W35',
                reason: 'This bucket is used for storing server access logs.',
            },
        ]);

        this.vpc = new DruidVpc(this, 'druid-vpc', {
            vpcId: props.vpcId,
            ipAddresses: props.vpcCidr ? ec2.IpAddresses.cidr(props.vpcCidr) : undefined,
            subnetConfiguration: [
                {
                    name: 'PrivateSubnet',
                    subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS,
                },
                {
                    name: 'PublicSubnet',
                    subnetType: ec2.SubnetType.PUBLIC,
                },
                {
                    name: 'IsolatedSubnet',
                    subnetType: ec2.SubnetType.PRIVATE_ISOLATED,
                },
            ],
            flowLogs: {
                cw: {
                    destination: ec2.FlowLogDestination.toS3(
                        this.serverAccessLogsBucket,
                        VPC_FLOW_LOGS_PREFIX
                    ),
                    trafficType: ec2.FlowLogTrafficType.ALL,
                },
            },
            subnetMappings: props.subnetMappings,
        });

        if (props.initInstallationBucket) {
            this.installationBucket = new s3.Bucket(
                this,
                'bootstrap-s3-bucket-installation',
                {
                    ...commonS3BucketProperties,
                    encryption: s3.BucketEncryption.S3_MANAGED,
                    serverAccessLogsPrefix: S3_ACCESS_LOGS_PREFIX,
                    serverAccessLogsBucket: this.serverAccessLogsBucket,
                }
            );

            new BucketDeployment(this, 'bucket-deployment-scripts', {
                sources: [Source.asset('lib/uploads/scripts')],
                destinationBucket: this.installationBucket,
                destinationKeyPrefix: SCRIPTS_FOLDER,
            });

            new BucketDeployment(this, 'bucket-deployment-extensions', {
                sources: [Source.asset(`lib/docker/extensions`)],
                destinationBucket: this.installationBucket,
                destinationKeyPrefix: EXTENSIONS_FOLDER,
                exclude: ['.gitkeep'],
            });

            new BucketDeployment(this, 'bucket-deployment-config', {
                sources: [Source.asset('lib/uploads/config')],
                destinationBucket: this.installationBucket,
                destinationKeyPrefix: CONFIG_FOLDER,
                exclude: ['*_version.txt'],
            });

            new BucketDeployment(this, 'bucket-deployment-rds-ca-bundle', {
                sources: [Source.asset('lib/docker/ca-certs')],
                destinationBucket: this.installationBucket,
                destinationKeyPrefix: 'ca-certs',
            });

            this.druidImageDeployment = new BucketDeployment(
                this,
                'bucket-deployment-druid-image',
                {
                    sources: [Source.asset('druid-bin/')],
                    destinationBucket: this.installationBucket,
                    destinationKeyPrefix: DRUID_IMAGE_FOLDER,
                    memoryLimit: 4096,
                    useEfs: true,
                    vpc: this.vpc,
                }
            );

            this.zookeeperImageDeployment = new BucketDeployment(
                this,
                'bucket-deployment-zookeeper-image',
                {
                    sources: [Source.asset('zookeeper-bin/')],
                    destinationBucket: this.installationBucket,
                    destinationKeyPrefix: ZOOKEEPER_IMAGE_FOLDER,
                }
            );
        }

        if (props.initBastion) {
            this.bastion = new ec2.BastionHostLinux(this, 'bastion', {
                vpc: this.vpc,
                subnetSelection: {
                    subnetType: ec2.SubnetType.PUBLIC,
                },
                requireImdsv2: true,
            });
        }

        const deepStorageEncryptionKeyId = 'deep-storage-encryption-key';
        if (props.druidDeepStorageConfig?.bucketArn) {
            // If a bucket ARN is provided without a KMS key, it is assumed to be SSE-S3
            this.deepStorageEncryptionKey = props.druidDeepStorageConfig
                .bucketEncryptionKeyArn
                ? kms.Key.fromKeyArn(
                      this,
                      deepStorageEncryptionKeyId,
                      props.druidDeepStorageConfig.bucketEncryptionKeyArn
                  )
                : undefined;
            this.deepStorageBucket = s3.Bucket.fromBucketArn(
                this,
                'deep-storage-bucket',
                props.druidDeepStorageConfig.bucketArn
            );
        } else {
            this.deepStorageEncryptionKey = props.druidDeepStorageConfig
                ?.bucketEncryptionKeyArn
                ? kms.Key.fromKeyArn(
                      this,
                      deepStorageEncryptionKeyId,
                      props.druidDeepStorageConfig.bucketEncryptionKeyArn
                  )
                : new kms.Key(this, deepStorageEncryptionKeyId, {
                      enableKeyRotation: true,
                  });

            this.deepStorageBucket = new s3.Bucket(this, 'deep-storage-bucket', {
                ...commonS3BucketProperties,
                encryptionKey: this.deepStorageEncryptionKey,
                encryption: s3.BucketEncryption.KMS,
                serverAccessLogsPrefix: S3_ACCESS_LOGS_PREFIX,
                serverAccessLogsBucket: this.serverAccessLogsBucket,
            });
        }

        if (props.oidcIdpConfig) {
            this.oidcIdpClientSecret = secretsmanager.Secret.fromSecretCompleteArn(
                this,
                'druid-oidc-client-secret',
                props.oidcIdpConfig.clientSecretArn
            );
        }

        this.snsTopic = new sns.Topic(this, 'asg-notification', {
            masterKey: new kms.Key(this, 'asg-notification-topic', {
                removalPolicy: cdk.RemovalPolicy.DESTROY,
                enableKeyRotation: true,
            }),
        });
    }
}
