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
