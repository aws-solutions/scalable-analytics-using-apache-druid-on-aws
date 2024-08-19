/* 
 Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 SPDX-License-Identifier: Apache-2.0
*/

import { Construct } from 'constructs';
import * as cdk from 'aws-cdk-lib';
import * as secrets from 'aws-cdk-lib/aws-secretsmanager';
import * as kms from 'aws-cdk-lib/aws-kms';
import * as cw from 'aws-cdk-lib/aws-cloudwatch';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import * as backup from 'aws-cdk-lib/aws-backup';
import * as events from 'aws-cdk-lib/aws-events';
import {
    AuroraMetadataStoreConfig,
    BackupPlanConfig,
    DruidClusterParameters,
    MetadataStoreType,
} from './types';
import {
    commonGraphWidgetProps,
    commonTextWidgetProps,
} from '../constructs/monitoringDashboard';
import { BaseInfrastructure } from '../constructs/baseInfrastructure';
import { MetadataStore } from '../constructs/metadataStore';
import { AuroraMetadataStore } from '../constructs/auroraMetadataStore';
import { CustomMetadataStore } from '../constructs/customMetadataStore';
import { AuroraServerlessMetadataStore } from '../constructs/auroraServerlessMetadataStore';
import { RDS_BACKUP_RETENTION_DAYS } from './constants';

export function createDatabaseSecret(
    scope: Construct,
    id: string,
    username: string,
    removalPolicy: cdk.RemovalPolicy,
    secretArn?: string,
    secretEncryptionArn?: string,
    description?: string
): secrets.ISecret {
    return secretArn
        ? secrets.Secret.fromSecretAttributes(scope, id, {
              secretCompleteArn: secretArn,
              encryptionKey: secretEncryptionArn
                  ? kms.Key.fromKeyArn(scope, `${id}-encryption-key`, secretEncryptionArn)
                  : undefined,
          })
        : new secrets.Secret(scope, id, {
              generateSecretString: {
                  secretStringTemplate: JSON.stringify({
                      username,
                  }),
                  generateStringKey: 'password',
                  excludePunctuation: true,
              },
              removalPolicy,
              encryptionKey: new kms.Key(scope, `${id}-encryption-key`, {
                  enableKeyRotation: true,
                  removalPolicy: removalPolicy,
              }),
              description,
          });
}

export function createDatabaseEncryptionKey(
    scope: Construct,
    removalPolicy: cdk.RemovalPolicy,
    metadataStoreConfig?: AuroraMetadataStoreConfig
): kms.IKey | undefined {
    if (metadataStoreConfig?.rdsSnapshotArn) {
        if (metadataStoreConfig.rdsSnapshotEncryptionKeyArn) {
            return kms.Key.fromKeyArn(
                scope,
                'rds-encryption-key',
                metadataStoreConfig.rdsSnapshotEncryptionKeyArn
            );
        }
        return undefined;
    } else {
        return new kms.Key(scope, 'rds-encryption-key', {
            enableKeyRotation: true,
            removalPolicy: removalPolicy,
        });
    }
}

export function createWidgetsForAuroraCluster(dbClusterIdentifier: string): cw.IWidget[] {
    return [
        new cw.TextWidget({
            ...commonTextWidgetProps,
            markdown: `### Druid RDS (${dbClusterIdentifier}) - Key Performance Indicators`,
        }),
        new cw.GraphWidget({
            title: 'CPU Utilization (%)',
            ...commonGraphWidgetProps,
            left: [
                new cw.Metric({
                    namespace: 'AWS/RDS',
                    period: cdk.Duration.minutes(1),
                    statistic: 'avg',
                    dimensionsMap: {
                        // eslint-disable-next-line @typescript-eslint/naming-convention
                        DBClusterIdentifier: dbClusterIdentifier,
                    },
                    metricName: 'CPUUtilization',
                }),
            ],
        }),
        new cw.GraphWidget({
            title: 'Database Connections',
            ...commonGraphWidgetProps,
            left: [
                new cw.Metric({
                    namespace: 'AWS/RDS',
                    period: cdk.Duration.minutes(1),
                    statistic: 'avg',
                    dimensionsMap: {
                        // eslint-disable-next-line @typescript-eslint/naming-convention
                        DBClusterIdentifier: dbClusterIdentifier,
                    },
                    metricName: 'DatabaseConnections',
                }),
            ],
        }),
        new cw.GraphWidget({
            title: 'Throughput',
            ...commonGraphWidgetProps,
            left: [
                new cw.Metric({
                    namespace: 'AWS/RDS',
                    period: cdk.Duration.minutes(1),
                    statistic: 'avg',
                    dimensionsMap: {
                        // eslint-disable-next-line @typescript-eslint/naming-convention
                        DBClusterIdentifier: dbClusterIdentifier,
                    },
                    metricName: 'ReadThroughput',
                }),
                new cw.Metric({
                    namespace: 'AWS/RDS',
                    period: cdk.Duration.minutes(1),
                    statistic: 'avg',
                    dimensionsMap: {
                        // eslint-disable-next-line @typescript-eslint/naming-convention
                        DBClusterIdentifier: dbClusterIdentifier,
                    },
                    metricName: 'WriteThroughput',
                }),
            ],
        }),
        new cw.GraphWidget({
            title: 'Free Memory',
            ...commonGraphWidgetProps,
            left: [
                new cw.Metric({
                    namespace: 'AWS/RDS',
                    period: cdk.Duration.minutes(1),
                    statistic: 'avg',
                    dimensionsMap: {
                        // eslint-disable-next-line @typescript-eslint/naming-convention
                        DBClusterIdentifier: dbClusterIdentifier,
                    },
                    metricName: 'FreeableMemory',
                }),
            ],
        }),
    ];
}

export function createMetadataStore(
    scope: Construct,
    clusterParams: DruidClusterParameters,
    baseInfra: BaseInfrastructure,
    securityGroup: ec2.ISecurityGroup,
    removalPolicy: cdk.RemovalPolicy
): MetadataStore {
    switch (clusterParams.druidMetadataStoreConfig?.metadataStoreType) {
        case MetadataStoreType.AURORA:
            return new AuroraMetadataStore(scope, 'druid-metadata-construct', {
                vpc: baseInfra.vpc,
                trafficSourceSecGrp: securityGroup,
                druidMetadataStoreConfig: clusterParams.druidMetadataStoreConfig,
                druidClusterName: clusterParams.druidClusterName,
                removalPolicy,
            });
        case MetadataStoreType.CUSTOM:
            return new CustomMetadataStore(scope, 'druid-metadata-construct', {
                vpc: baseInfra.vpc,
                trafficSourceSecGrp: securityGroup,
                druidMetadataStoreConfig: clusterParams.druidMetadataStoreConfig,
                druidClusterName: clusterParams.druidClusterName,
                removalPolicy,
            });
        default:
            return new AuroraServerlessMetadataStore(scope, 'druid-metadata-construct', {
                vpc: baseInfra.vpc,
                trafficSourceSecGrp: securityGroup,
                druidMetadataStoreConfig: clusterParams.druidMetadataStoreConfig,
                druidClusterName: clusterParams.druidClusterName,
                removalPolicy,
            });
    }
}

export function createBackupPlan(
    scope: Construct,
    planConfig: BackupPlanConfig,
    clusterArn: string
): void {
    const backupPlan = new backup.BackupPlan(scope, 'aurora-backup-plan');
    backupPlan.addRule(
        new backup.BackupPlanRule({
            startWindow: cdk.Duration.hours(1),
            completionWindow: cdk.Duration.hours(4),
            scheduleExpression: events.Schedule.expression(planConfig.scheduleExpression),
            deleteAfter: cdk.Duration.days(
                planConfig.deleteAfterDays ?? RDS_BACKUP_RETENTION_DAYS
            ),
        })
    );

    backupPlan.addSelection('aurora-backup-selection', {
        resources: [backup.BackupResource.fromArn(clusterArn)],
    });
}
