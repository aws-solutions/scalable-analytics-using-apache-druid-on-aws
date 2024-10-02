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

import * as appRegistry from '@aws-sdk/client-service-catalog-appregistry';

import { CloudFormationCustomResourceEvent } from 'aws-lambda';
import { SDK_CLIENT_CONFIG } from '../utils/constants';

export async function handler(
    event: CloudFormationCustomResourceEvent
): Promise<{ IsComplete: boolean }> {
    const { applicationId } = event.ResourceProperties;

    switch (event.RequestType) {
        case 'Create':
        case 'Update':
            return getIsCompleteStatus(applicationId);
        case 'Delete':
            return {
                IsComplete: true,
            };
    }
}

const getIsCompleteStatus = async (
    applicationId: string
): Promise<{ IsComplete: boolean }> => {
    const state = await getApplicationResourceGroupState(applicationId);
    if (!state || state === 'CREATING' || state === 'UPDATING') {
        return {
            IsComplete: false,
        };
    }

    if (state === 'CREATE_COMPLETE' || state === 'UPDATE_COMPLETE') {
        return {
            IsComplete: true,
        };
    }

    throw new Error(`Application Resource Group is in ${state} state`);
};

const getApplicationResourceGroupState = async (
    applicationId: string
): Promise<string | undefined> => {
    console.log('Querying Application Resource Group State');
    const appRegistryClient = new appRegistry.ServiceCatalogAppRegistryClient(
        SDK_CLIENT_CONFIG
    );

    const response = await appRegistryClient.send(
        new appRegistry.GetApplicationCommand({ application: applicationId })
    );

    const state = response.integrations?.resourceGroup?.state;

    console.log('Application Resource Group State: ', state);
    return state;
};
