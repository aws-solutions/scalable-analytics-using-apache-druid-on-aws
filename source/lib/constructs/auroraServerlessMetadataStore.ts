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
import * as cw from 'aws-cdk-lib/aws-cloudwatch';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import * as kms from 'aws-cdk-lib/aws-kms';
import * as metadataStoreUtils from '../utils/metadataStoreUtils';
import * as rds from 'aws-cdk-lib/aws-rds';

import { MetadataStore, MetadataStoreProps } from './metadataStore';
import {
    DEFAULT_POSTGRES_VERSION,
    RDS_BACKUP_RETENTION_DAYS,
    RDS_DB_NAME,
    RDS_DB_USERNAME,
} from '../utils/constants';
import { commonGraphWidgetProps, commonTextWidgetProps } from './monitoringDashboard';

import { AuroraMetadataStoreConfig } from '../utils/types';
import { Construct } from 'constructs';

export class AuroraServerlessMetadataStore extends MetadataStore {
    private readonly encryptionKey?: kms.IKey;

    public constructor(scope: Construct, id: string, props: MetadataStoreProps) {
        super(scope, id, props);

        const metadataStoreConfig = props.druidMetadataStoreConfig
            ?.metadataStoreConfig as AuroraMetadataStoreConfig | undefined;

        this.dbMasterUserSecret = metadataStoreUtils.createDatabaseSecret(
            this,
            'rds-master-user-secret',
            metadataStoreConfig?.rdsMasterUsername ?? RDS_DB_USERNAME,
            props.removalPolicy
        );

        this.encryptionKey = metadataStoreUtils.createDatabaseEncryptionKey(
            this,
            props.removalPolicy,
            metadataStoreConfig
        );

        const commonClusterProps = {
            engine: rds.DatabaseClusterEngine.auroraPostgres({
                version: metadataStoreConfig?.rdsEngineVersion
                    ? rds.AuroraPostgresEngineVersion.of(
                          metadataStoreConfig.rdsEngineVersion,
                          metadataStoreConfig.rdsEngineVersion.split('.')[0]
                      )
                    : DEFAULT_POSTGRES_VERSION,
            }),
            vpc: props.vpc,
            defaultDatabaseName: RDS_DB_NAME,
            vpcSubnets: { subnetType: ec2.SubnetType.PRIVATE_ISOLATED },
            scaling: { autoPause: cdk.Duration.minutes(5) },
            ...(metadataStoreConfig?.rdsParameterGroupName && {
                parameterGroup: rds.ParameterGroup.fromParameterGroupName(
                    this,
                    'param-group',
                    metadataStoreConfig.rdsParameterGroupName
                ),
            }),
            backupRetention: cdk.Duration.days(RDS_BACKUP_RETENTION_DAYS),
            removalPolicy: props.removalPolicy,
            storageEncryptionKey: this.encryptionKey,
        };

        const cluster = metadataStoreConfig?.rdsSnapshotArn
            ? new rds.ServerlessClusterFromSnapshot(
                  this,
                  'aurora-serverless-from-snapshot',
                  {
                      ...commonClusterProps,
                      snapshotIdentifier: metadataStoreConfig.rdsSnapshotArn,
                  }
              )
            : new rds.ServerlessCluster(this, 'aurora-serverless', {
                  ...commonClusterProps,
                  credentials: rds.Credentials.fromSecret(this.dbMasterUserSecret),
              });

        cluster.connections.allowFrom(
            props.trafficSourceSecGrp,
            ec2.Port.tcp(cluster.clusterEndpoint.port)
        );

        if (props.druidMetadataStoreConfig?.backupPlanConfig) {
            metadataStoreUtils.createBackupPlan(
                this,
                props.druidMetadataStoreConfig.backupPlanConfig,
                cluster.clusterArn
            );
        }

        this.dbEndpointAddress = cluster.clusterEndpoint.hostname;
        this.dbEndpointPort = cluster.clusterEndpoint.port;
        this.dbIdentifier = cluster.clusterIdentifier;
        this.dbName = RDS_DB_NAME;

        this.cloudwatchWidgets = this.createCloudWatchWidgets(this.dbIdentifier);
    }

    private createCloudWatchWidgets(dbIdentifier: string): cw.IWidget[] {
        const commonMetricProps = {
            namespace: 'AWS/RDS',
            statistic: cw.Stats.AVERAGE,
            dimensionsMap: {
                // eslint-disable-next-line @typescript-eslint/naming-convention
                DBClusterIdentifier: dbIdentifier,
            },
            period: cdk.Duration.minutes(1),
        };
        return [
            new cw.TextWidget({
                ...commonTextWidgetProps,
                markdown: `### Druid Aurora Serverless (${dbIdentifier}) - Key Performance Indicators`,
            }),
            new cw.GraphWidget({
                title: 'CPU Utilization (%)',
                ...commonGraphWidgetProps,
                left: [
                    new cw.Metric({ ...commonMetricProps, metricName: 'CPUUtilization' }),
                ],
            }),
            new cw.GraphWidget({
                title: 'Database Connections',
                ...commonGraphWidgetProps,
                left: [
                    new cw.Metric({
                        ...commonMetricProps,
                        metricName: 'DatabaseConnections',
                    }),
                ],
            }),
            new cw.GraphWidget({
                title: 'Throughput',
                ...commonGraphWidgetProps,
                left: [
                    new cw.Metric({
                        ...commonMetricProps,
                        metricName: 'ReadThroughput',
                    }),
                    new cw.Metric({
                        ...commonMetricProps,
                        metricName: 'WriteThroughput',
                    }),
                ],
            }),
            new cw.GraphWidget({
                title: 'Latency',
                ...commonGraphWidgetProps,
                left: [
                    new cw.Metric({
                        ...commonMetricProps,
                        metricName: 'ReadLatency',
                    }),
                    new cw.Metric({
                        ...commonMetricProps,
                        metricName: 'WriteLatency',
                    }),
                ],
            }),
            new cw.GraphWidget({
                title: 'Capacity',
                ...commonGraphWidgetProps,
                left: [
                    new cw.Metric({
                        ...commonMetricProps,
                        metricName: '	ServerlessDatabaseCapacity',
                    }),
                ],
            }),
        ];
    }
}
