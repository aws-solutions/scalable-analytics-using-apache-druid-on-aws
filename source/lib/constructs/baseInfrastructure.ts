/* 
 Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 SPDX-License-Identifier: Apache-2.0
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
    readonly selfManageInstallationBucketAssets?: boolean;
    readonly druidClusterName: string;
    readonly druidDeepStorageConfig?: DruidDeepStorageConfig;
    readonly oidcIdpConfig?: OidcIdpConfig;
    readonly removalPolicy: cdk.RemovalPolicy;
    readonly subnetMappings?: SubnetMapping;
    readonly provisionS3Clear?: boolean;
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

    private readonly s3ClearLambdaFunction?: cdk.aws_lambda.Function;
    private readonly s3ClearLambdaRole?: cdk.aws_iam.Role;
    private readonly clearServerAccessLogsBucket?: cdk.CustomResource;

    public constructor(scope: Construct, id: string, props: BaseInfrastructureProps) {
        super(scope, id);

        const commonS3BucketProperties = {
            blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
            versioned: true,
            enforceSSL: true,
            removalPolicy: props.removalPolicy,
        };

        // Provision the S3 Clear Lambda Function if needed.
        if (props.provisionS3Clear) {
            [this.s3ClearLambdaRole, this.s3ClearLambdaFunction] =
                this.provisionS3ClearLambdaFunction();
        }

        [this.serverAccessLogsBucket, this.clearServerAccessLogsBucket] =
            this.provisionServerAccessLogBucket(
                commonS3BucketProperties,
                this.s3ClearLambdaFunction,
                this.s3ClearLambdaRole
            );

        this.vpc = this.provisionVpc(props, this.serverAccessLogsBucket);

        if (this.s3ClearLambdaFunction && this.clearServerAccessLogsBucket) {
            this.vpc.node.addDependency(this.clearServerAccessLogsBucket);
        }

        if (props.initInstallationBucket) {
            // prettier-ignore
            [this.installationBucket, this.druidImageDeployment, this.zookeeperImageDeployment] = this.initInstallationBucket(
                commonS3BucketProperties,
                props,
                this.vpc,
                this.s3ClearLambdaRole,
                this.s3ClearLambdaFunction,
                this.serverAccessLogsBucket,
            );
        }

        if (props.initBastion) {
            this.bastion = new ec2.BastionHostLinux(this, 'bastion', {
                vpc: this.vpc,
                subnetSelection: {
                    subnetType: ec2.SubnetType.PUBLIC,
                },
                machineImage: ec2.MachineImage.latestAmazonLinux2023(),
                requireImdsv2: true,
            });
        }

        [this.deepStorageBucket, this.deepStorageEncryptionKey] =
            this.setupDeepStorageBucket(
                props,
                commonS3BucketProperties,
                this.serverAccessLogsBucket,
                this.s3ClearLambdaFunction,
                this.s3ClearLambdaRole
            );

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

    private provisionVpc(
        props: BaseInfrastructureProps,
        serverAccessLogsBucket: s3.IBucket
    ): ec2.IVpc {
        const vpc = new DruidVpc(this, 'druid-vpc', {
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
                        serverAccessLogsBucket,
                        VPC_FLOW_LOGS_PREFIX
                    ),
                    trafficType: ec2.FlowLogTrafficType.ALL,
                },
            },
            subnetMappings: props.subnetMappings,
        });

        return vpc;
    }

    private provisionServerAccessLogBucket(
        commonS3BucketProperties: {
            blockPublicAccess: s3.BlockPublicAccess;
            versioned: boolean;
            enforceSSL: boolean;
            removalPolicy: cdk.RemovalPolicy;
        },
        s3ClearLambdaFunction: cdk.aws_lambda.Function | undefined,
        s3ClearLambdaRole: cdk.aws_iam.Role | undefined
    ): [s3.IBucket, cdk.CustomResource?] {
        // prettier-ignore
        const serverAccessLogsBucket = new s3.Bucket(this, 'server-access-logs-bucket', { // NOSONAR - commonS3BucketProperties provides bucket parameters
            ...commonS3BucketProperties,
            encryption: s3.BucketEncryption.S3_MANAGED,
        });
        addCfnNagSuppression(serverAccessLogsBucket, [
            {
                id: 'W35',
                reason: 'This bucket is used for storing server access logs.',
            },
        ]);

        let clearServerAccessLogsBucket: cdk.CustomResource | undefined = undefined;
        if (s3ClearLambdaFunction) {
            clearServerAccessLogsBucket = new cdk.CustomResource(
                this,
                'ClearServerAccessLogsBucket',
                {
                    serviceToken: s3ClearLambdaFunction.functionArn,
                    properties: {
                        bucket: serverAccessLogsBucket.bucketName,
                    },
                }
            );

            serverAccessLogsBucket.node.addDependency(s3ClearLambdaRole!);
        }

        return [serverAccessLogsBucket, clearServerAccessLogsBucket];
    }

    private provisionS3ClearLambdaFunction(): [
        cdk.aws_iam.Role,
        cdk.aws_lambda.Function,
    ] {
        // NOSONAR-start - The polling policy is required for the custom resource helper to work
        // Permissions needed by custom resource to perform polling
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

        const s3ClearLambdaRole = new cdk.aws_iam.Role(this, 's3ClearLambdaRole', {
            assumedBy: new cdk.aws_iam.ServicePrincipal('lambda.amazonaws.com'),
            managedPolicies: [
                cdk.aws_iam.ManagedPolicy.fromAwsManagedPolicyName('AmazonS3FullAccess'),
            ],
            inlinePolicies: {
                s3ClearPollingPolicyDocument: s3ClearPollingPolicy.document,
                lambdaBasicExecutionPolicyDocument: lambdaBasicExecutionPolicy.document,
            },
        });

        const s3ClearLambdaFunction = new cdk.aws_lambda.Function(
            this,
            'S3ClearLambdaFunction',
            {
                runtime: cdk.aws_lambda.Runtime.PYTHON_3_12,
                handler: 'lambda_function.handler',
                description: 'This function empties the contents of a given S3 bucket',
                role: s3ClearLambdaRole,
                code: cdk.aws_lambda.Code.fromAsset('lib/lambdas/s3-clear'),
                timeout: cdk.Duration.minutes(15),
            }
        );

        return [s3ClearLambdaRole, s3ClearLambdaFunction];
    }

    private initInstallationBucket(
        commonS3BucketProperties: {
            blockPublicAccess: s3.BlockPublicAccess;
            versioned: boolean;
            enforceSSL: boolean;
            removalPolicy: cdk.RemovalPolicy;
        },
        props: BaseInfrastructureProps,
        vpc: ec2.IVpc,
        s3ClearLambdaRole: cdk.aws_iam.Role | undefined,
        s3ClearLambdaFunction: cdk.aws_lambda.Function | undefined,
        serverAccessLogsBucket: s3.IBucket
    ): [s3.IBucket, BucketDeployment?, BucketDeployment?] {
        const installationBucket: s3.IBucket = new s3.Bucket( // NOSONAR - commonS3BucketProperties provides bucket parameters
            this,
            'bootstrap-s3-bucket-installation',
            {
                ...commonS3BucketProperties,
                encryption: s3.BucketEncryption.S3_MANAGED,
                serverAccessLogsPrefix: S3_ACCESS_LOGS_PREFIX,
                serverAccessLogsBucket: serverAccessLogsBucket,
            }
        );

        if (s3ClearLambdaFunction) {
            const _clearInstallationBucket = new cdk.CustomResource(
                this,
                'ClearInstallationBucket',
                {
                    serviceToken: s3ClearLambdaFunction.functionArn,
                    properties: {
                        bucket: installationBucket.bucketName,
                    },
                }
            );

            installationBucket.node.addDependency(s3ClearLambdaRole!);
        }

        let druidImageDeployment: BucketDeployment | undefined = undefined;
        let zookeeperImageDeployment: BucketDeployment | undefined = undefined;
        if (!props.selfManageInstallationBucketAssets) {
            // using prettier-ignore prevents prettier from reformatting the nosonar line to the next line
            // prettier-ignore
            new BucketDeployment(this, 'bucket-deployment-scripts', { // NOSONAR - standard cdk
                sources: [Source.asset('lib/uploads/scripts')],
                destinationBucket: installationBucket,
                destinationKeyPrefix: SCRIPTS_FOLDER,
                vpc: vpc,
            });

            // prettier-ignore
            new BucketDeployment(this, 'bucket-deployment-extensions', { // NOSONAR - standard cdk
                sources: [Source.asset(`lib/docker/extensions`)],
                destinationBucket: installationBucket,
                destinationKeyPrefix: EXTENSIONS_FOLDER,
                exclude: ['.gitkeep'],
                vpc: vpc,
            });

            // prettier-ignore
            new BucketDeployment(this, 'bucket-deployment-config', { // NOSONAR - standard cdk
                sources: [Source.asset('lib/uploads/config')],
                destinationBucket: installationBucket,
                destinationKeyPrefix: CONFIG_FOLDER,
                exclude: ['*_version.txt'],
                vpc: vpc,
            });

            // prettier-ignore
            new BucketDeployment(this, 'bucket-deployment-rds-ca-bundle', { // NOSONAR - standard cdk
                sources: [Source.asset('lib/docker/ca-certs')],
                destinationBucket: installationBucket,
                destinationKeyPrefix: 'ca-certs',
                vpc: vpc,
            });

            druidImageDeployment = new BucketDeployment(
                this,
                'bucket-deployment-druid-image',
                {
                    sources: [Source.asset('druid-bin/')],
                    destinationBucket: installationBucket,
                    destinationKeyPrefix: DRUID_IMAGE_FOLDER,
                    memoryLimit: 4096,
                    useEfs: true,
                    vpc: vpc,
                }
            );

            zookeeperImageDeployment = new BucketDeployment(
                this,
                'bucket-deployment-zookeeper-image',
                {
                    sources: [Source.asset('zookeeper-bin/')],
                    destinationBucket: installationBucket,
                    destinationKeyPrefix: ZOOKEEPER_IMAGE_FOLDER,
                    vpc: vpc,
                }
            );
        }

        return [installationBucket, druidImageDeployment, zookeeperImageDeployment];
    }

    private setupDeepStorageBucket(
        props: BaseInfrastructureProps,
        commonS3BucketProperties: {
            blockPublicAccess: s3.BlockPublicAccess;
            versioned: boolean;
            enforceSSL: boolean;
            removalPolicy: cdk.RemovalPolicy;
        },
        serverAccessLogsBucket: s3.IBucket,
        s3ClearLambdaFunction: cdk.aws_lambda.Function | undefined,
        s3ClearLambdaRole: cdk.aws_iam.Role | undefined
    ): [s3.IBucket, kms.IKey?] {
        const deepStorageEncryptionKeyId = 'deep-storage-encryption-key';
        let deepStorageEncryptionKey: kms.IKey | undefined = undefined;
        let deepStorageBucket = null;
        if (props.druidDeepStorageConfig?.bucketArn) {
            // If a bucket ARN is provided without a KMS key, it is assumed to be SSE-S3
            deepStorageEncryptionKey = props.druidDeepStorageConfig.bucketEncryptionKeyArn
                ? kms.Key.fromKeyArn(
                      this,
                      deepStorageEncryptionKeyId,
                      props.druidDeepStorageConfig.bucketEncryptionKeyArn
                  )
                : undefined;
            deepStorageBucket = s3.Bucket.fromBucketArn(
                this,
                'deep-storage-bucket',
                props.druidDeepStorageConfig.bucketArn
            );
        } else {
            deepStorageEncryptionKey = props.druidDeepStorageConfig
                ?.bucketEncryptionKeyArn
                ? kms.Key.fromKeyArn(
                      this,
                      deepStorageEncryptionKeyId,
                      props.druidDeepStorageConfig.bucketEncryptionKeyArn
                  )
                : new kms.Key(this, deepStorageEncryptionKeyId, {
                      enableKeyRotation: true,
                  });

            // prettier-ignore
            deepStorageBucket = new s3.Bucket(this, 'deep-storage-bucket', { // NOSONAR - commonS3BucketProperties provides bucket parameters
                ...commonS3BucketProperties,
                encryptionKey: deepStorageEncryptionKey,
                encryption: s3.BucketEncryption.KMS,
                serverAccessLogsPrefix: S3_ACCESS_LOGS_PREFIX,
                serverAccessLogsBucket: serverAccessLogsBucket,
            });

            if (s3ClearLambdaFunction) {
                const _clearDeepStorageBucket = new cdk.CustomResource(
                    this,
                    'ClearDeepStorageBucket',
                    {
                        serviceToken: s3ClearLambdaFunction.functionArn,
                        properties: {
                            bucket: deepStorageBucket.bucketName,
                        },
                    }
                );

                deepStorageBucket.node.addDependency(s3ClearLambdaRole!);
            }
        }

        return [deepStorageBucket, deepStorageEncryptionKey];
    }
}
