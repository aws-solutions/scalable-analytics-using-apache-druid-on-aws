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
import { ZOOKEEPER_DEFAULT_VERSION } from '../utils/constants';

export const configScheme = {
    type: 'object',
    properties: {
        vpcCidr: {
            type: 'string',
            minLength: 1,
            pattern: '^[0-9]{1,3}.[0-9]{1,3}.[0-9]{1,3}.[0-9]{1,3}/[0-9]{1,2}$',
            title: 'VPC CIDR',
            description: 'CIDR of the VPC to use.',
            examples: ['10.0.0.0/16'],
            $id: '#/properties/vpcCidr',
        },
        vpcId: {
            type: 'string',
            minLength: 1,
            pattern: '^vpc-[a-zA-Z0-9]{8,}$',
            title: 'VPC ID',
            description: 'VPC ID to use.',
            examples: ['vpc-00000000'],
            $id: '#/properties/vpcId',
        },
        druidDomain: {
            type: 'string',
            minLength: 1,
            title: 'Druid domain',
            $id: '#/properties/druidDomain',
            description: 'The domain name to reach Druid cluster.',
            examples: ['druid-test.com'],
        },
        route53HostedZoneId: {
            type: 'string',
            minLength: 1,
            pattern: '^[a-zA-Z0-9]{1,63}$',
            title: 'Route53 Hosted Zone ID',
            $id: '#/properties/route53HostedZoneId',
            description: 'Route53 Hosted Zone ID.',
            examples: ['Z2FDTNDATAQYW2'],
        },
        tlsCertificateArn: {
            type: 'string',
            minLength: 1,
            pattern:
                '^arn:aws:acm:[a-z]{2}-[a-z]+-[0-9]:[0-9]{12}:certificate/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$',
            title: 'TLS Certificate ARN',
            $id: '#/properties/tlsCertificateArn',
            description: 'TLS Certificate ARN.',
        },
        route53HostedZoneName: {
            type: 'string',
            minLength: 1,
            title: 'Route53 Hosted Zone Name',
            $id: '#/properties/route53HostedZoneName',
            description: 'Route53 Hosted Zone Name.',
            examples: ['druid-test.com'],
            pattern: '^[a-zA-Z0-9-.]+$',
        },
        druidInstanceIamPolicyArns: {
            type: 'array',
            items: {
                type: 'string',
                pattern: '^arn:aws:iam::.*:policy/[a-zA-Z0-9_-]+$',
                minLength: 1,
            },
            uniqueItems: true,
            minItems: 1,
            maxItems: 50,
            title: 'Druid Instance IAM Policy ARNs',
            $id: '#/properties/druidInstanceIamPolicyArns',
            description: 'IAM Policies to attach to the Druid instances.',
        },
        zookeeperVersion: {
            type: 'string',
            default: ZOOKEEPER_DEFAULT_VERSION,
            minLength: 1,
            maxLength: 50,
            pattern: '^[a-zA-Z0-9_.-]+$',
            title: 'Zookeeper Version',
            $id: '#/properties/zookeeperVersion',
            description: 'Version of Zookeeper to use.',
            examples: ['3.8.0'],
        },
        druidVersion: {
            type: 'string',
            minLength: 1,
            maxLength: 50,
            pattern: '^[a-zA-Z0-9_.-]+$',
            title: 'Druid Version',
            $id: '#/properties/druidVersion',
            description: 'Version of Druid to use.',
            examples: ['25.0.0', '26.0.0'],
        },
        druidExtensions: {
            type: 'array',
            items: {
                type: 'string',
                pattern: '^[a-zA-Z0-9_-]+$',
                minLength: 1,
                maxLength: 50,
            },
            uniqueItems: true,
            minItems: 1,
            description: 'Extensions to enable for Druid.',
            examples: [
                'druid-hdfs-storage',
                'druid-kafka-indexing-service',
                'druid-datasketches',
                'druid-s3-extensions',
                'mysql-metadata-storage',
                'postgresql-metadata-storage',
                'druid-kinesis-indexing-service',
                'druid-avro-extensions',
                'druid-parquet-extensions',
                'druid-protobuf-extensions',
                'druid-orc-extensions',
                'druid-basic-security',
                'druid-pac4j',
            ],
            title: 'Extensions',
            $id: '#/properties/druidExtensions',
        },
        druidClusterName: {
            type: 'string',
            pattern: '^[a-zA-Z0-9_-]+$',
            minLength: 1,
            maxLength: 50,
            title: 'Druid Cluster Name',
            $id: '#/properties/druidClusterName',
            description: 'Name of the Druid cluster.',
            examples: ['druid-test'],
        },
        druidDeepStorageConfig: {
            type: 'object',
            title: 'Druid Deep Storage Config',
            $id: '#/properties/druidDeepStorageConfig',
            description: 'Configuration for the Druid Deep Storage.',
            properties: {
                bucketArn: {
                    type: 'string',
                    minLength: 1,
                    title: 'Bucket ARN',
                    $id: '#/properties/druidDeepStorageConfig/properties/bucketArn',
                    description: 'The ARN of the S3 bucket to use.',
                    examples: ['arn:aws:s3:::druid-test'],
                    pattern: '^arn:aws:s3:.*$',
                },
                bucketPrefix: {
                    type: 'string',
                    minLength: 1,
                    title: 'Bucket Prefix',
                    $id: '#/properties/druidDeepStorageConfig/properties/bucketPrefix',
                    description: 'The prefix to use for the S3 bucket.',
                    examples: ['druid-test'],
                },
                bucketEncryptionKeyArn: {
                    type: 'string',
                    minLength: 1,
                    title: 'Bucket Encryption Key ARN',
                    $id: '#/properties/druidDeepStorageConfig/properties/bucketEncryptionKeyArn',
                    description: 'The ARN of the KMS key to use for encryption.',
                    examples: [
                        '0000000000000000000000000000000000:key/1234abcd-12ab-34cd-56ef-1234567890ab',
                    ],
                    pattern: '^arn:aws:kms:.*$',
                },
            },
        },
        druidMetadataStoreConfig: {
            type: 'object',
            title: 'Druid Metadata Store Config',
            $id: '#/properties/druidMetadataStoreConfig',
            description: 'Configuration for the Druid Metadata Store.',
            properties: {
                metadataStoreType: {
                    type: 'string',
                    enum: ['aurora', 'aurora_serverless', 'custom'],
                },
                metadataStoreConfig: {
                    type: 'object',
                    title: 'Metadata Store Config',
                    $id: '#/properties/druidMetadataStoreConfig/properties/metadataStoreConfig',
                    description: 'Configuration for the metadata store.',
                    properties: {
                        rdsMasterUsername: {
                            type: 'string',
                            title: 'RDS Master Username',
                            description: 'The username for the RDS master.',
                            examples: ['druid'],
                        },
                        rdsEngineVersion: {
                            type: 'string',
                            title: 'RDS Engine Version',
                            description: 'The RDS engine version.',
                            examples: ['13.7'],
                            pattern: '^[0-9]+\\.[0-9]+$',
                        },
                        rdsInstanceType: {
                            type: 'string',
                            title: 'RDS Instance Type',
                            description: 'The RDS instance type.',
                            examples: ['db.m4.large'],
                        },
                        rdsInstanceCount: {
                            type: 'integer',
                            title: 'RDS Instance Count',
                            description: 'The number of RDS instances to use.',
                            examples: [1],
                            minimum: 1,
                        },
                    },
                },
                backupPlanConfig: {
                    type: 'object',
                    title: 'Backup Plan Config',
                    $id: '#/properties/druidMetadataStoreConfig/properties/backupPlanConfig',
                    description: 'Configuration for the backup plan.',
                    properties: {
                        scheduleExpression: {
                            type: 'string',
                            title: 'Schedule Expression',
                            description: 'The schedule expression.',
                            examples: ['cron(0 0 * * ? *)'],
                            pattern: '^cron\\(.+ .+ .+ .+ .+ .+\\)$',
                        },
                        deleteAfterDays: {
                            type: 'integer',
                            title: 'Delete After Days',
                            description: 'The number of days to keep backups.',
                            examples: [7],
                            minimum: 1,
                            maximum: 365,
                        },
                    },
                },
            },
        },
        internetFacing: {
            type: 'boolean',
            title: 'Internet-facing',
            $id: '#/properties/internetFacing',
            description: 'Whether the cluster is internet-facing.',
        },
        retainData: {
            type: 'boolean',
            title: 'Retain Data',
            $id: '#/properties/retainData',
            description: 'Whether to retain data on shutdown.',
        },
        bastionHost: {
            type: 'boolean',
            title: 'Init Bastion Host',
            $id: '#/properties/bastionHost',
            description: 'Whether to initialize the bastion.',
        },
        enableVulnerabilityScanJob: {
            type: 'boolean',
            title: 'Enable Vulnerability Scan Job',
            $id: '#/properties/enableVulnerabilityScanJob',
            description: 'Whether to enable vulnerability scan job.',
        },
        environmentAgnostic: {
            type: 'boolean',
            title: 'Environment Agnostic',
            $id: '#/properties/environmentAgnostic',
            description: 'Whether to use environment agnostic configuration.',
        },
        subnetMappings: {
            type: 'object',
            title: 'Subnet Mappings',
            $id: '#/properties/subnetMappings',
            description: 'The subnet mappings.',
            properties: {
                ingress: {
                    $ref: '#/definitions/subnetMapping',
                },
                service: {
                    $ref: '#/definitions/subnetMapping',
                },
                database: {
                    $ref: '#/definitions/subnetMapping',
                },
            },
            definitions: {
                subnetMapping: {
                    type: 'array',
                    items: {
                        type: 'string',
                        pattern: '^subnet-.+$',
                    },
                    title: 'Subnet Mapping',
                    $id: '#/definitions/subnetMapping',
                },
            },
            examples: [
                {
                    ingress: ['subnet-1234abcd', 'subnet-5678efgh'],
                    service: ['subnet-1234abcd', 'subnet-5678efgh'],
                    database: ['subnet-1234abcd', 'subnet-5678efgh'],
                },
            ],
        },
        druidOperationPlatform: {
            type: 'string',
            enum: ['ec2', 'ecs', 'eks'],
            title: 'Druid Operation Platform',
            $id: '#/properties/druidOperationPlatform',
            description: 'The operation platform for Druid.',
            examples: ['ec2', 'ecs', 'eks'],
        },
        druidConcurrentQueryLimit: {
            type: 'integer',
            title: 'Druid Concurrent Query Limit',
            $id: '#/properties/druidConcurrentQueryLimit',
            description: 'The concurrent query limit for Druid.',
            examples: [100],
            minimum: 1,
        },
        useFipsEndpoint: {
            type: 'boolean',
            title: 'Use FIPS Endpoint',
            $id: '#/properties/useFipsEndpoint',
            description: 'Whether to use FIPS endpoint.',
        },
        customAmi: {
            type: 'object',
            title: 'Custom AMI lookup config',
            $id: '#/properties/customAmi',
            description: 'Custom AMI for EC2 instances.',
            properties: {
                arm64: {
                    type: 'object',
                    title: 'ARM based AMI lookup config',
                    $id: '#/properties/customAmi/arm64',
                    properties: {
                        name: {
                            type: 'string',
                            title: 'AMI name',
                            description: 'AMI name',
                        },
                        owners: {
                            type: 'array',
                            items: { type: 'string', minLength: 1 },
                            minItems: 0,
                            description: 'AMI owners AWS account Ids or aliases',
                            title: 'AMI Owners',
                        },
                    },
                },
                amd64: {
                    type: 'object',
                    title: 'x64 based AMI lookup config',
                    $id: '#/properties/customAmi/amd64',
                    properties: {
                        name: {
                            type: 'string',
                            title: 'AMI name',
                            description: 'AMI name',
                        },
                        owners: {
                            type: 'array',
                            items: { type: 'string', minLength: 1 },
                            minItems: 0,
                            description: 'AMI owners AWS account Ids or aliases',
                            title: 'AMI Owners',
                        },
                    },
                },
            },
        },
        druidEksConfig: {
            type: 'object',
            title: 'Druid EKS Config',
            $id: '#/properties/druidEksConfig',
            description: 'Configuration for the EKS instance.',
            required: [
                'clusterMasterPrincipalArn',
                'capacityProviderType',
                'capacityProviderConfig',
            ],
            properties: {
                endpointAccess: {
                    type: 'string',
                    enum: ['PUBLIC', 'PRIVATE', 'PUBLIC_AND_PRIVATE'],
                    title: 'Endpoint Access',
                    description: 'The endpoint access.',
                    examples: ['PUBLIC', 'PRIVATE', 'PUBLIC_AND_PRIVATE'],
                },
                clusterMasterPrincipalArn: {
                    type: 'string',
                    title: 'Cluster Master Principal ARN',
                    description:
                        'The ARN of the IAM role that is used to manage access to the cluster.',
                    examples: ['0000000000000000000000000:role/druid-cluster-role'],
                    pattern: '^arn:aws:iam::.*:role/.+$',
                },
                clusterEncryptionConfigKeyArn: {
                    type: 'string',
                    title: 'Cluster Encryption Config Key ARN',
                    description: 'The ARN of the KMS key used to encrypt the data.',
                    examples: [
                        '0000000000000000000000000000000000:key/00000000000000000',
                    ],
                    pattern: '^arn:aws:kms:.*$',
                },
                capacityProviderType: {
                    type: 'string',
                    enum: ['fargate', 'ec2'],
                    title: 'Capacity Provider Type',
                    description: 'The type of the capacity provider.',
                    examples: ['fargate', 'ec2'],
                },
                capacityProviderConfig: {
                    type: 'object',
                    oneOf: [
                        {
                            type: 'object',
                            title: 'Fargate Capacity Provider Config',
                            $id: '#/properties/capacityProviderConfig/oneOf/0',
                            required: [
                                'historical',
                                'middleManager',
                                'coordinator',
                                'overlord',
                                'router',
                                'broker',
                                'zookeeper',
                            ],
                            properties: {
                                historical: {
                                    $ref: '#/properties/capacityProviderConfig/oneOf/0/definitions/fargateConfig',
                                },
                                middleManager: {
                                    $ref: '#/properties/capacityProviderConfig/oneOf/0/definitions/fargateConfig',
                                },
                                coordinator: {
                                    $ref: '#/properties/capacityProviderConfig/oneOf/0/definitions/fargateConfig',
                                },
                                overlord: {
                                    $ref: '#/properties/capacityProviderConfig/oneOf/0/definitions/fargateConfig',
                                },
                                router: {
                                    $ref: '#/properties/capacityProviderConfig/oneOf/0/definitions/fargateConfig',
                                },
                                broker: {
                                    $ref: '#/properties/capacityProviderConfig/oneOf/0/definitions/fargateConfig',
                                },
                                zookeeper: {
                                    $ref: '#/properties/capacityProviderConfig/oneOf/0/definitions/fargateConfig',
                                },
                            },
                            patternProperties: {
                                '^historical_\\w+': {
                                    $ref: '#/properties/capacityProviderConfig/oneOf/0/definitions/fargateConfig',
                                },
                                '^middleManager_\\w+': {
                                    $ref: '#/properties/capacityProviderConfig/oneOf/0/definitions/fargateConfig',
                                },
                            },
                            definitions: {
                                fargateConfig: {
                                    $id: '#/properties/capacityProviderConfig/oneOf/0/definitions/fargateConfig',
                                    type: 'object',
                                    required: ['cpu', 'memory', 'minNodes'],
                                    properties: {
                                        cpu: {
                                            type: 'integer',
                                            title: 'CPU',
                                            minimum: 1,
                                            multipleOf: 1,
                                            description: 'CPU units.',
                                            examples: [1, 2, 4, 8, 16, 32, 64, 128],
                                        },
                                        memory: {
                                            type: 'string',
                                            title: 'Memory',
                                            pattern: '^[0-9]+Gi$',
                                        },
                                        minNodes: {
                                            type: 'integer',
                                            title: 'Minimum Nodes',
                                            minimum: 1,
                                        },
                                        maxNodes: {
                                            type: 'integer',
                                            title: 'Maximum Nodes',
                                            minimum: 1,
                                        },
                                        segmentCacheVolumeSize: {
                                            type: 'integer',
                                            title: 'Segment Cache Volume Size',
                                            minimum: 20,
                                            description:
                                                'Size of the segment cache volume in GB.',
                                        },
                                        taskCacheVolumeSize: {
                                            type: 'integer',
                                            title: 'Task Cache Volume Size',
                                            minimum: 20,
                                            description:
                                                'Size of the task cache volume in GB.',
                                        },
                                    },
                                },
                            },
                        },
                        {
                            type: 'object',
                            title: 'EC2 Capacity Provider Config',
                            $id: '#/properties/capacityProviderConfig/oneOf/1',
                            required: ['master', 'query', 'data', 'zookeeper'],
                            properties: {
                                master: {
                                    $ref: '#/properties/capacityProviderConfig/oneOf/1/definitions/nodeGroupConfig',
                                },
                                query: {
                                    $ref: '#/properties/capacityProviderConfig/oneOf/1/definitions/nodeGroupConfig',
                                },
                                data: {
                                    $ref: '#/properties/capacityProviderConfig/oneOf/1/definitions/nodeGroupConfig',
                                },
                                zookeeper: {
                                    $ref: '#/properties/capacityProviderConfig/oneOf/1/definitions/nodeGroupConfig',
                                },
                            },
                            patternProperties: {
                                '^data_\\w+': {
                                    $ref: '#/properties/capacityProviderConfig/oneOf/1/definitions/nodeGroupConfig',
                                },
                            },
                            definitions: {
                                nodeGroupConfig: {
                                    $id: '#/properties/capacityProviderConfig/oneOf/1/definitions/nodeGroupConfig',
                                    type: 'object',
                                    required: ['minNodes', 'instanceType'],
                                    properties: {
                                        minNodes: {
                                            type: 'integer',
                                            title: 'Minimum Nodes',
                                            minimum: 1,
                                        },
                                        maxNodes: {
                                            type: 'integer',
                                            title: 'Maximum Nodes',
                                            minimum: 1,
                                        },
                                        instanceType: {
                                            type: 'string',
                                            title: 'Instance Type',
                                            examples: ['m5.2xlarge'],
                                        },
                                        cpuPerNode: {
                                            type: 'integer',
                                            title: 'CPU Per Node',
                                            minimum: 1,
                                        },
                                        rootVolumeSize: {
                                            type: 'integer',
                                            title: 'Root Volume Size',
                                            minimum: 20,
                                            description: 'Size of the root volume in GB.',
                                        },
                                        segmentCacheVolumeSize: {
                                            type: 'integer',
                                            title: 'Segment Cache Volume Size',
                                            minimum: 20,
                                            description:
                                                'Size of the segment cache volume in GB.',
                                        },
                                        taskCacheVolumeSize: {
                                            type: 'integer',
                                            title: 'Task Cache Volume Size',
                                            minimum: 20,
                                            description:
                                                'Size of the task cache volume in GB.',
                                        },
                                    },
                                },
                            },
                        },
                    ],
                },
            },
        },
        druidEc2Config: {
            type: 'object',
            title: 'Druid EC2 Config',
            $id: '#/properties/druidEc2Config',
            description: 'Configuration for the EC2 instance.',
            definitions: {
                instanceConfig: {
                    type: 'object',
                    $id: '#/definitions/instanceConfig',
                    properties: {
                        minNodes: {
                            type: 'integer',
                            title: 'Minimum Nodes',
                            minimum: 1,
                        },
                        maxNodes: {
                            type: 'integer',
                            title: 'Maximum Nodes',
                            minimum: 1,
                        },
                        instanceType: {
                            type: 'string',
                            title: 'Instance Type',
                            examples: ['m5.2xlarge'],
                        },
                        rootVolumeSize: {
                            type: 'integer',
                            title: 'Root Volume Size',
                            minimum: 20,
                            description: 'Size of the root volume in GB.',
                            examples: [100],
                        },
                        segmentCacheVolumeSize: {
                            type: 'integer',
                            title: 'Segment Cache Volume Size',
                            minimum: 20,
                            description: 'Size of the segment cache volume in GB.',
                        },
                        autoScalingPolicy: {
                            type: 'object',
                            title: 'Auto Scaling Policy',
                            properties: {
                                schedulePolicies: {
                                    type: 'array',
                                    title: 'Schedule Policies',
                                    uniqueItems: true,
                                    minItems: 1,
                                    items: {
                                        type: 'object',
                                        title: 'Schedule Policy',
                                        properties: {
                                            scheduleExpression: {
                                                type: 'string',
                                                title: 'Schedule Expression',
                                                examples: ['30 8 * * *'],
                                            },
                                            minNodes: {
                                                type: 'integer',
                                                title: 'Minimum Nodes',
                                                minimum: 1,
                                            },
                                            maxNodes: {
                                                type: 'integer',
                                                title: 'Maximum Nodes',
                                                minimum: 1,
                                            },
                                        },
                                    },
                                },
                            },
                        },
                        rollingUpdatePolicy: {
                            type: 'object',
                            title: 'Rolling Update Policy',
                            properties: {
                                maxBatchSize: {
                                    type: 'integer',
                                    title: 'Max Batch Size',
                                    minimum: 1,
                                },
                                pauseTimeInMinutes: {
                                    type: 'integer',
                                    title: 'Pause Time In Minutes',
                                    minimum: 1,
                                },
                            },
                        },
                    },
                    required: ['minNodes', 'instanceType'],
                },
            },
            patternProperties: {
                '^data': {
                    $ref: '#/definitions/instanceConfig',
                },
                '^historical': {
                    $ref: '#/definitions/instanceConfig',
                },
                '^middleManager': {
                    $ref: '#/definitions/instanceConfig',
                },
                '^query': {
                    $ref: '#/definitions/instanceConfig',
                },
            },
            properties: {
                master: {
                    $ref: '#/definitions/instanceConfig',
                },
                query: {
                    $ref: '#/definitions/instanceConfig',
                },
                zookeeper: {
                    type: 'object',
                    $id: '#/properties/zookeeper',
                    properties: {
                        instanceType: {
                            type: 'string',
                            title: 'Instance Type',
                            examples: ['m5.2xlarge'],
                            description: 'Instance type for the zookeeper.',
                        },
                        minNodes: {
                            type: 'integer',
                            title: 'Minimum Nodes',
                            oneOf: [
                                { type: 'integer', multipleOf: 5 },
                                { type: 'integer', multipleOf: 3 },
                            ],
                        },
                        maxNodes: {
                            type: 'integer',
                            title: 'Maximum Nodes',
                            oneOf: [
                                { type: 'integer', multipleOf: 5 },
                                { type: 'integer', multipleOf: 3 },
                            ],
                        },
                        rootVolumeSize: {
                            type: 'integer',
                            title: 'Root Volume Size',
                            minimum: 20,
                            description: 'Size of the root volume in GB.',
                            examples: [100],
                        },
                    },
                    required: ['instanceType', 'minNodes'],
                },
            },
            additionalProperties: false,
            required: ['zookeeper', 'master', 'query'],
        },
        druidEmitterConfig: {
            type: 'object',
            title: 'Druid Emitter Config',
            $id: '#/properties/druidEmitterConfig',
            properties: {
                emitterType: {
                    type: 'string',
                    title: 'Emitter Type',
                    enum: ['statsd', 'cloudwatch'],
                    default: 'cloudwatch',
                },
                emitterConfig: {
                    type: 'object',
                    title: 'Emitter Config',
                    $id: '#/properties/druidEmitterConfig/properties/emitterConfig',
                    properties: {
                        hostname: {
                            type: 'string',
                            title: 'Hostname',
                            examples: ['localhost'],
                        },
                        port: {
                            type: 'integer',
                            title: 'Port',
                            examples: [8125],
                        },
                        dogstatsdConstantTags: {
                            type: 'array',
                            title: 'Dogstatsd Constant Tags',
                            $id: '#/properties/druidEmitterConfig/properties/emitterConfig/properties/dogstatsdConstantTags',
                            items: {
                                type: 'string',
                                title: 'Dogstatsd Constant Tag',
                                examples: ['environment:test'],
                            },
                        },
                    },
                    required: ['hostname', 'port'],
                },
            },
        },
        druidRetentionRules: {
            type: 'array',
            title: 'Druid Retention Rules',
            $id: '#/properties/druidRetentionRules',
            items: {
                type: 'object',
                title: 'Druid Retention Rule',
                $id: '#/properties/druidRetentionRules/items',
                properties: {
                    type: {
                        type: 'string',
                        enum: [
                            'loadByPeriod',
                            'loadForever',
                            'loadByInterval',
                            'dropByInterval',
                            'dropForever',
                            'dropByPeriod',
                            'dropBeforeByPeriod',
                            'broadcastForever',
                            'broadcastByPeriod',
                            'broadcastByInterval',
                        ],
                    },
                    period: {
                        type: 'string',
                        title: 'Period',
                        description: 'Period of the rule',
                        examples: ['P1D'],
                    },
                    interval: {
                        type: 'string',
                        title: 'Interval',
                        description: 'Interval of the rule',
                        examples: ['P1D'],
                    },
                    includeFuture: {
                        type: 'boolean',
                        title: 'Include Future',
                        description: 'Include future',
                        examples: [true],
                    },
                },
            },
        },
        oidcIdpConfig: {
            type: 'object',
            title: 'OIDC IDP Config',
            $id: '#/properties/oidcIdpConfig',
            required: ['clientId', 'clientSecretArn', 'discoveryURI'],
            properties: {
                clientId: {
                    type: 'string',
                    title: 'Client ID',
                    examples: ['test-client-id'],
                },
                clientSecretArn: {
                    type: 'string',
                    title: 'Client Secret ARN',
                    pattern: 'arn:aws:secretsmanager:.*:.*:secret:.*',
                    examples: [
                        '000000000000000000000000000000000000000000000:secret:test-client-secret-arn',
                    ],
                },
                discoveryURI: {
                    type: 'string',
                    title: 'Discovery URI',
                    examples: [
                        'https://accounts.google.com/.well-known/openid-configuration',
                    ],
                    description: 'OIDC discovery URI',
                    pattern: '^https://.*',
                },
            },
        },
        tags: {
            type: 'object',
            title: 'Solution Tags',
            $id: '#/properties/tags',
            propertyNames: { type: 'string' },
            additionalProperties: { type: 'string' },
        },
        additionalTags: {
            type: 'object',
            title: 'Additional solution tags',
            $id: '#/properties/additionalTags',
            propertyNames: { type: 'string' },
            additionalProperties: { type: 'string' },
        },
    },
    required: [
        'druidVersion',
        'druidOperationPlatform',
        'druidClusterName',
        'druidExtensions',
    ],
};
