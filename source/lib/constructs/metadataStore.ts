/* 
 Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 SPDX-License-Identifier: Apache-2.0
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
