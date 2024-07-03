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
import * as metadataStoreUtils from '../utils/metadataStoreUtils';
import * as rds from 'aws-cdk-lib/aws-rds';

import {
    DEFAULT_POSTGRES_VERSION,
    RDS_BACKUP_RETENTION_DAYS,
    RDS_DB_NAME,
    RDS_DB_USERNAME,
} from '../utils/constants';
import { MetadataStore, MetadataStoreProps } from './metadataStore';

import { AuroraMetadataStoreConfig } from '../utils/types';
import { Construct } from 'constructs';

//Create RDS Database to store metadata that is used by Druid
export class AuroraMetadataStore extends MetadataStore {
    private readonly encryptionKey?: kms.IKey;

    public constructor(scope: Construct, id: string, props: MetadataStoreProps) {
        super(scope, id, props);

        const metadataStoreConfig = props.druidMetadataStoreConfig
            ?.metadataStoreConfig as AuroraMetadataStoreConfig | undefined;

        const instanceProps: rds.ProvisionedClusterInstanceProps = {
            allowMajorVersionUpgrade: true,
            autoMinorVersionUpgrade: true,
            publiclyAccessible: false,
            instanceType: new ec2.InstanceType(
                metadataStoreConfig?.rdsInstanceType ?? 't3.large'
            ),
            ...(metadataStoreConfig?.rdsParameterGroupName && {
                parameterGroup: rds.ParameterGroup.fromParameterGroupName(
                    this,
                    'param-group',
                    metadataStoreConfig.rdsParameterGroupName
                ),
            }),
            caCertificate: rds.CaCertificate.RDS_CA_RSA2048_G1,
        };

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

        let readers: rds.IClusterInstance[] | undefined = undefined;

        if (metadataStoreConfig?.rdsInstanceCount) {
            readers = [];
            for (
                let index = 0;
                index < metadataStoreConfig.rdsInstanceCount - 1;
                index++
            ) {
                readers.push(
                    rds.ClusterInstance.provisioned(`reader${index}`, instanceProps)
                );
            }
        }

        const commonClusterProps: rds.DatabaseClusterProps = {
            engine: rds.DatabaseClusterEngine.auroraPostgres({
                version: metadataStoreConfig?.rdsEngineVersion
                    ? rds.AuroraPostgresEngineVersion.of(
                          metadataStoreConfig.rdsEngineVersion,
                          metadataStoreConfig.rdsEngineVersion.split('.')[0]
                      )
                    : DEFAULT_POSTGRES_VERSION,
            }),

            writer: rds.ClusterInstance.provisioned('writer', instanceProps),
            readers,
            defaultDatabaseName: RDS_DB_NAME,
            removalPolicy: props.removalPolicy,
            backup: {
                retention: cdk.Duration.days(RDS_BACKUP_RETENTION_DAYS),
            },
            storageEncrypted: true,
            storageEncryptionKey: this.encryptionKey,
            vpc: props.vpc,
            vpcSubnets: { subnetType: ec2.SubnetType.PRIVATE_ISOLATED },
        };

        const cluster = metadataStoreConfig?.rdsSnapshotArn
            ? new rds.DatabaseClusterFromSnapshot(this, 'aurora-cluster', {
                  ...commonClusterProps,
                  snapshotIdentifier: metadataStoreConfig.rdsSnapshotArn,
                  snapshotCredentials: rds.SnapshotCredentials.fromSecret(
                      this.dbMasterUserSecret
                  ),
              })
            : new rds.DatabaseCluster(this, 'aurora-cluster', {
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
                `arn:${cdk.Aws.PARTITION}:rds:${cdk.Aws.REGION}:${cdk.Aws.ACCOUNT_ID}:cluster:${cluster.clusterIdentifier}`
            );
        }

        this.dbEndpointAddress = cluster.clusterEndpoint.hostname;
        this.dbEndpointPort = cluster.clusterEndpoint.port;
        this.dbIdentifier = cluster.clusterIdentifier;
        this.dbName = RDS_DB_NAME;

        this.cloudwatchWidgets = metadataStoreUtils.createWidgetsForAuroraCluster(
            this.dbIdentifier
        );
    }
}
