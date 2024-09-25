/* 
 Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 SPDX-License-Identifier: Apache-2.0
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
