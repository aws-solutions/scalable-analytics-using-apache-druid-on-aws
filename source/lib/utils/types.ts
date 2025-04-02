/* 
 Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 SPDX-License-Identifier: Apache-2.0
*/
/* eslint-disable @typescript-eslint/naming-convention */
import * as cdk from 'aws-cdk-lib';
import * as ec2 from 'aws-cdk-lib/aws-ec2';

import { ComparisonOperator, TreatMissingData } from 'aws-cdk-lib/aws-cloudwatch';

import { ScalingInterval } from 'aws-cdk-lib/aws-applicationautoscaling';

export enum DruidProcessType {
    COORDINATOR = 'coordinator',
    HISTORICAL = 'historical',
    MIDDLE_MANAGER = 'middleManager',
    OVERLORD = 'overlord',
    BROKER = 'broker',
    ROUTER = 'router',
    ZOOKEEPER = 'zookeeper',
}

// Logical groups of Druid processes
export enum DruidNodeType {
    MASTER = 'master',
    DATA = 'data',
    QUERY = 'query',
    HISTORICAL = 'historical',
    MIDDLE_MANAGER = 'middleManager',
    ZOOKEEPER = 'zookeeper',
}

export interface SubnetMapping {
    ingress: string[];
    service: string[];
    database: string[];
}

export interface CustomAmi {
    arm64?: { name: string; owners: string[] };
    amd64?: { name: string; owners: string[] };
}

export interface DruidConfig {
    readonly vpcId?: string;
    readonly vpcCidr?: string;

    readonly customAmi?: CustomAmi;
    readonly subnetMappings?: SubnetMapping;

    readonly route53HostedZoneId?: string;
    readonly route53HostedZoneName?: string;
    readonly druidDomain?: string;
    readonly tlsCertificateArn?: string;

    readonly internetFacing?: boolean;
    readonly useFipsEndpoint?: boolean;
    readonly bastionHost?: boolean;
    readonly retainData?: boolean;
    readonly enableVulnerabilityScanJob?: boolean;
    readonly environmentAgnostic?: boolean;
    readonly selfManageInstallationBucketAssets?: boolean;

    readonly druidClusterName: string;
    readonly druidVersion: string;
    readonly zookeeperVersion?: string;

    readonly druidOperationPlatform: 'ec2' | 'eks' | 'ecs';
    readonly druidEc2Config?: Ec2Config;
    readonly druidEksConfig?: EksConfig;

    readonly druidExtensions: string[];
    readonly druidMetadataStoreConfig?: DruidMetadataStoreConfig;
    readonly druidDeepStorageConfig?: DruidDeepStorageConfig;
    readonly druidCommonRuntimeConfig?: Record<string, unknown>;
    readonly oidcIdpConfig?: OidcIdpConfig;
    readonly druidEmitterConfig?: DruidEmitterConfig;
    readonly druidRetentionRules?: RetentionRule[];
    readonly druidConcurrentQueryLimit?: number;
    readonly druidInstanceIamPolicyArns?: string[];

    readonly tags?: Record<string, string>;
    readonly additionalTags?: Record<string, string>;
}

export interface DruidStackProps extends cdk.StackProps {
    readonly vpcId?: string;
    readonly vpcCidr?: string;
    readonly initBastion?: boolean;
    readonly initInstallationBucket?: boolean;
    readonly selfManageInstallationBucketAssets?: boolean;
    readonly route53Params?: {
        readonly route53HostedZoneId: string;
        readonly route53HostedZoneName: string;
    };
    readonly druidDomain?: string;
    readonly tlsCertificateArn?: string;
    readonly clusterParams: DruidClusterParameters;
    readonly removalPolicy: cdk.RemovalPolicy;
    readonly solutionId: string;
    readonly solutionVersion: string;
    readonly solutionName: string;
    readonly solutionTags: Record<string, string>;
    readonly customAmi?: CustomAmi;
    readonly subnetMappings?: SubnetMapping;
    readonly enableVulnerabilityScanJob: boolean;
    readonly provisionS3Clear: boolean;
}

export interface DruidClusterParameters {
    readonly druidClusterName: string;
    readonly zookeeperVersion: string;
    readonly druidVersion: string;
    readonly druidExtensions: string[];
    readonly druidMetadataStoreConfig?: DruidMetadataStoreConfig;
    readonly druidDeepStorageConfig?: DruidDeepStorageConfig;
    readonly druidCommonRuntimeConfig?: Record<string, unknown>;
    readonly hostingConfig: Ec2Config | EksConfig;
    readonly oidcIdpConfig?: OidcIdpConfig;
    readonly druidEmitterConfig?: DruidEmitterConfig;
    readonly internetFacing?: boolean;
    readonly enableFipsEndpoints: boolean;
    readonly druidRetentionRules?: RetentionRule[];
    readonly druidConcurrentQueryLimit: number;
    readonly druidInstanceIamPolicyArns?: string[];
}

export type EksEndPointAccessType = 'PUBLIC' | 'PRIVATE' | 'PUBLIC_AND_PRIVATE';

export enum EksCapacityProviderType {
    EC2 = 'ec2',
    FARGATE = 'fargate',
}

export interface EksConfig {
    readonly endpointAccess?: EksEndPointAccessType;
    readonly clusterMasterPrincipalArn: string;
    readonly clusterEncryptionConfigKeyArn?: string;
    readonly capacityProviderType?: EksCapacityProviderType;
    readonly capacityProviderConfig: EksNodeGroupConfig | EksFargateConfig;
}

export type EksNodeGroupConfig = Record<
    string,
    {
        minNodes: number;
        maxNodes?: number;
        rootVolumeSize?: number;
        segmentCacheVolumeSize?: number;
        taskCacheVolumeSize?: number;
        instanceType: string;
        runtimeConfig?: Record<DruidProcessType, Record<string, unknown>>;
    }
>;

export type EksFargateConfig = Record<
    string,
    {
        cpu: number;
        memory: string;
        minNodes: number;
        maxNodes?: number;
        segmentCacheVolumeSize?: number;
        taskCacheVolumeSize?: number;
        runtimeConfig?: Record<string, unknown>;
    }
>;

export interface MetadataStoreConfig {
    /* Secret stores username and password for druid administrative user
       This solution will create a new secret if no secret is provided */
    druidInternalUserSecretArn?: string;
    druidInternalUserSecretEncryptionKeyArn?: string;
    /* Secret stores username and password for druid internal system user
       This solution will create a new secret if no secret is provided */
    druidAdminUserSecretArn?: string;
    druidAdminUserSecretEncryptionKeyArn?: string;
}

export interface AuroraMetadataStoreConfig extends MetadataStoreConfig {
    // Brand new RDS cluster
    rdsInstanceType?: string;
    rdsInstanceCount?: number;
    rdsEngineVersion?: string;

    // Recreate from existing snapshot
    rdsSnapshotArn?: string;
    rdsSnapshotEncryptionKeyArn?: string;
    rdsMasterUsername?: string;

    rdsParameterGroupName?: string;
}

export interface CustomMetadataStoreConfig extends MetadataStoreConfig {
    databaseUri: string;
    databasePort?: number;
    databaseName?: string;
    // Secret stores the username and password for connecting to the database
    databaseSecretArn: string;
}

export enum MetadataStoreType {
    AURORA = 'aurora',
    AURORA_SERVERLESS = 'aurora_serverless',
    CUSTOM = 'custom',
}

export interface BackupPlanConfig {
    // Cron expression for the backup.
    scheduleExpression: string;
    deleteAfterDays?: number;
}

export interface DruidMetadataStoreConfig {
    metadataStoreType: MetadataStoreType;
    metadataStoreConfig?: AuroraMetadataStoreConfig | CustomMetadataStoreConfig;
    backupPlanConfig?: BackupPlanConfig;
}

export interface DruidDeepStorageConfig {
    bucketArn?: string;
    bucketPrefix?: string;
    // The ARN of the KMS key used to encrypt the data in the bucket.
    bucketEncryptionKeyArn?: string;
}

/* The name of the process must appear on the list of Ec2ProcessType,
   or it should start with "historical_" followed by a tier name,
   or it should start with "query_" followed by a tier name. */
export type Ec2Config = Record<string, Ec2InstanceConfig | undefined>;

export interface Ec2InstanceConfig {
    minNodes: number;
    maxNodes?: number;
    rootVolumeSize?: number;
    segmentCacheVolumeSize?: number;
    instanceType: string;
    servicePriority?: number;
    autoScalingPolicy?: AutoScalingPolicy;
    rollingUpdatePolicy?: RollingUpdatePolicy;
    runtimeConfig?: Record<DruidProcessType, Record<string, unknown>>;
}

export interface Ec2InstanceTypeInfo {
    readonly cpu: number;
    readonly memory: number;
    readonly arch: ec2.AmazonLinuxCpuType;
}

export interface RollingUpdatePolicy {
    maxBatchSize?: number;
}

export type RetentionRuleType =
    | 'loadByPeriod'
    | 'loadForever'
    | 'loadByInterval'
    | 'dropByInterval'
    | 'dropForever'
    | 'dropByPeriod'
    | 'dropBeforeByPeriod'
    | 'broadcastForever'
    | 'broadcastByPeriod'
    | 'broadcastByInterval';

export interface RetentionRule {
    type: RetentionRuleType;
    // Time period format as per ISO-8601
    period?: string;
    // Time interval format as per ISO-8601
    interval?: string;
    includeFuture?: boolean;
    tieredReplicants?: Record<string, number>;
}

export interface AutoScalingPolicy {
    cpuUtilisationPercent?: number;
    requestCountPerTarget?: number;
    pendingTaskCountScaleSteps?: ScalingInterval[];
    diskUtilisationScaleSteps?: ScalingInterval[];
    schedulePolicies?: {
        // Crontab expression format as per https://en.wikipedia.org/wiki/Cron.
        scheduleExpression: string;
        minNodes: number;
        maxNodes?: number;
        startTime?: string;
        endTime?: string;
    }[];
}

export interface OidcIdpConfig {
    clientId: string;
    clientSecretArn: string;
    discoveryURI: string;
    groupClaimName?: string;
    customScopes?: string[];
    groupRoleMappings?: Record<string, string[]>;
}

export interface StatsdEmitterConfig {
    hostname: string;
    port: number;
    dogstatsdConstantTags?: string[];
}

export interface DruidEmitterConfig {
    emitterType: 'cloudwatch' | 'statsd';
    emitterConfig?: StatsdEmitterConfig;
}

export interface AlarmMetric {
    readonly metricName: string;
    readonly namespace: string;
    readonly period: number;
    readonly statistic: string;
    dimensionsMap?: Record<string, string>;
}

export interface DruidAlarm {
    readonly alarmName: string;
    readonly datapointsToAlarm: number;
    readonly evaluationPeriods: number;
    readonly comparisonOperator: ComparisonOperator | undefined;
    readonly treatMissingData: TreatMissingData | undefined;
    readonly threshold: number;
    readonly evaluateLowSampleCountPercentile?: string;
    readonly metric: AlarmMetric;
}

export interface AlarmStruct {
    readonly druidAlarms: DruidAlarm[];
}
