/* 
 Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 SPDX-License-Identifier: Apache-2.0
*/
import * as secrets from 'aws-cdk-lib/aws-secretsmanager';

import { MetadataStore, MetadataStoreProps } from './metadataStore';

import { Construct } from 'constructs';
import { CustomMetadataStoreConfig } from '../utils/types';
import { DEFAULT_POSTGRES_PORT, RDS_DB_NAME } from '../utils/constants';

export class CustomMetadataStore extends MetadataStore {
    public constructor(scope: Construct, id: string, props: MetadataStoreProps) {
        super(scope, id, props);

        const metadataStoreConfig = props.druidMetadataStoreConfig
            ?.metadataStoreConfig as CustomMetadataStoreConfig;

        this.dbEndpointAddress = metadataStoreConfig.databaseUri;
        this.dbEndpointPort = metadataStoreConfig.databasePort ?? DEFAULT_POSTGRES_PORT;
        this.dbMasterUserSecret = secrets.Secret.fromSecretAttributes(this, 'db-secret', {
            secretCompleteArn: metadataStoreConfig.databaseSecretArn,
        });
        this.dbName = metadataStoreConfig.databaseName ?? RDS_DB_NAME;
    }
}
