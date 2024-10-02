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
import * as metadataStoreUtils from '../utils/metadataStoreUtils';
import * as secrets from 'aws-cdk-lib/aws-secretsmanager';

import { DRUID_ADMIN_USERNAME, DRUID_INTERNAL_SYSTEM_USERNAME } from '../utils/constants';

import { Construct } from 'constructs';
import { DruidMetadataStoreConfig } from '../utils/types';

export interface MetadataStoreProps {
    vpc: ec2.IVpc;
    trafficSourceSecGrp: ec2.ISecurityGroup;
    removalPolicy: cdk.RemovalPolicy;
    druidMetadataStoreConfig?: DruidMetadataStoreConfig;
    druidClusterName: string;
}

export abstract class MetadataStore extends Construct {
    public dbMasterUserSecret: secrets.ISecret;
    public readonly druidAdminUserSecret: secrets.ISecret;
    public readonly druidInternalSystemUserSecret: secrets.ISecret;
    public dbEndpointAddress: string;
    public dbEndpointPort: number;
    public dbName: string;
    public dbIdentifier?: string;
    protected cloudwatchWidgets: cw.IWidget[] = [];

    public constructor(scope: Construct, id: string, props: MetadataStoreProps) {
        super(scope, id);
        this.druidAdminUserSecret = metadataStoreUtils.createDatabaseSecret(
            this,
            'druid-admin-user-secret',
            DRUID_ADMIN_USERNAME,
            props.removalPolicy,
            props.druidMetadataStoreConfig?.metadataStoreConfig?.druidAdminUserSecretArn,
            props.druidMetadataStoreConfig?.metadataStoreConfig
                ?.druidAdminUserSecretEncryptionKeyArn,
            `Administrator user credentials for Druid cluster ${props.druidClusterName}`
        );
        this.druidInternalSystemUserSecret = metadataStoreUtils.createDatabaseSecret(
            this,
            'druid-internal-system-user-secret',
            DRUID_INTERNAL_SYSTEM_USERNAME,
            props.removalPolicy,
            props.druidMetadataStoreConfig?.metadataStoreConfig
                ?.druidInternalUserSecretArn,
            props.druidMetadataStoreConfig?.metadataStoreConfig
                ?.druidInternalUserSecretEncryptionKeyArn,
            `Internal system user credentials for Druid cluster ${props.druidClusterName}`
        );
    }

    public getCloudWatchWidgets(): cw.IWidget[] {
        return this.cloudwatchWidgets;
    }
}
