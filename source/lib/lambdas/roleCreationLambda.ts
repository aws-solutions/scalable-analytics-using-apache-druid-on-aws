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
import * as utils from './retentionConfigLambda';

import {
    CloudFormationCustomResourceEvent,
    CloudFormationCustomResourceFailedResponse,
    CloudFormationCustomResourceSuccessResponse,
} from 'aws-lambda';

import axios from 'axios';
import { backOff } from 'exponential-backoff';

const permissionMap: Record<
    string,
    { resource: { name: string; type: string }; action: 'READ' | 'WRITE' }[]
> = {
    administrator: [
        {
            resource: {
                name: '.*',
                type: 'CONFIG',
            },
            action: 'READ',
        },
        {
            resource: {
                name: '.*',
                type: 'CONFIG',
            },
            action: 'WRITE',
        },
        {
            resource: {
                name: '.*',
                type: 'QUERY_CONTEXT',
            },
            action: 'READ',
        },
        {
            resource: {
                name: '.*',
                type: 'QUERY_CONTEXT',
            },
            action: 'WRITE',
        },
        {
            resource: {
                name: '.*',
                type: 'SYSTEM_TABLE',
            },
            action: 'READ',
        },
        {
            resource: {
                name: '.*',
                type: 'SYSTEM_TABLE',
            },
            action: 'WRITE',
        },
        {
            resource: {
                name: '.*',
                type: 'EXTERNAL',
            },
            action: 'READ',
        },
        {
            resource: {
                name: '.*',
                type: 'EXTERNAL',
            },
            action: 'WRITE',
        },
        {
            resource: {
                name: '.*',
                type: 'DATASOURCE',
            },
            action: 'READ',
        },
        {
            resource: {
                name: '.*',
                type: 'DATASOURCE',
            },
            action: 'WRITE',
        },
        {
            resource: {
                name: '.*',
                type: 'STATE',
            },
            action: 'READ',
        },
        {
            resource: {
                name: '.*',
                type: 'STATE',
            },
            action: 'WRITE',
        },
        {
            resource: {
                name: '.*',
                type: 'VIEW',
            },
            action: 'READ',
        },
        {
            resource: {
                name: '.*',
                type: 'VIEW',
            },
            action: 'WRITE',
        },
    ],
    manage: [
        {
            resource: {
                name: '.*',
                type: 'DATASOURCE',
            },
            action: 'WRITE',
        },
        {
            resource: {
                name: '.*',
                type: 'DATASOURCE',
            },
            action: 'READ',
        },
        {
            resource: {
                name: '.*',
                type: 'STATE',
            },
            action: 'WRITE',
        },
        {
            resource: {
                name: '.*',
                type: 'STATE',
            },
            action: 'READ',
        },
        {
            resource: {
                name: '.*',
                type: 'CONFIG',
            },
            action: 'WRITE',
        },
        {
            resource: {
                name: '.*',
                type: 'CONFIG',
            },
            action: 'READ',
        },
    ],
    read: [
        {
            resource: {
                name: '.*',
                type: 'DATASOURCE',
            },
            action: 'READ',
        },
        {
            resource: {
                name: '.*',
                type: 'STATE',
            },
            action: 'READ',
        },
    ],
    write: [
        {
            resource: {
                name: '.*',
                type: 'DATASOURCE',
            },
            action: 'WRITE',
        },
        {
            resource: {
                name: '.*',
                type: 'DATASOURCE',
            },
            action: 'READ',
        },
        {
            resource: {
                name: '.*',
                type: 'STATE',
            },
            action: 'WRITE',
        },
        {
            resource: {
                name: '.*',
                type: 'STATE',
            },
            action: 'READ',
        },
    ],
};

const druidEndpoint = process.env['DRUID_ENDPOINT'];
const retryConfig = {
    numOfAttempts: parseInt(process.env['NUM_OF_ATTEMPTS'] ?? '5'),
    startingDelay: parseInt(process.env['STARTING_DELAY'] ?? '5000'),
    maxDelay: 60000,
};

// creates the admin, manage, read and write roles with associated permissions and group mapping
export async function onEventHandler(
    event: CloudFormationCustomResourceEvent
): Promise<
    | CloudFormationCustomResourceSuccessResponse
    | CloudFormationCustomResourceFailedResponse
> {
    console.info(`Processing event ${JSON.stringify(event)}`);

    const { groupRoleMappings } = event.ResourceProperties;

    switch (event.RequestType) {
        case 'Create':
            await createRoles(
                groupRoleMappings
            ); /* eslint-disable @typescript-eslint/naming-convention */
            return { ...event, Status: 'SUCCESS', PhysicalResourceId: '' };
        case 'Update':
            await updateGroupRoleMappings(groupRoleMappings);
            /* eslint-disable @typescript-eslint/naming-convention */
            return { ...event, Status: 'SUCCESS', PhysicalResourceId: '' };
        default:
            /* eslint-disable @typescript-eslint/naming-convention */
            return { ...event, Status: 'SUCCESS', PhysicalResourceId: '' };
    }
}

async function createRoles(groupRoleMappings: Record<string, string[]>): Promise<void> {
    const axiosConfig = await utils.generateAxiosConfig();

    // create the roles
    try {
        await backOff(() => {
            const createRoleTasks = Object.keys(permissionMap).map((x) => {
                return axios.post(
                    `${druidEndpoint}/proxy/coordinator/druid-ext/basic-security/authorization/db/basic/roles/${x}`,
                    undefined,
                    axiosConfig
                );
            });

            return Promise.all(createRoleTasks);
        }, retryConfig);
    } catch (e) {
        console.error(
            `Received an error while creating initial roles, error status: ${
                axios.isAxiosError(e) ? e.status : ''
            }`
        );
    }

    // create role permission
    try {
        await backOff(() => {
            const createPermissionTasks = Object.keys(permissionMap).map((x) => {
                return axios.post(
                    `${druidEndpoint}/proxy/coordinator/druid-ext/basic-security/authorization/db/basic/roles/${x}/permissions`,
                    permissionMap[x],
                    axiosConfig
                );
            });

            return Promise.all(createPermissionTasks);
        }, retryConfig);
    } catch (e) {
        console.error(
            `Received an error while creating permissions for initial roles, error status: ${
                axios.isAxiosError(e) ? e.status : ''
            }`
        );
    }

    // create role group mappings
    try {
        await backOff(() => {
            const createGroupRoleMappingTasks = Object.keys(groupRoleMappings).map(
                (x) => {
                    return axios.post(
                        `${druidEndpoint}/proxy/coordinator/druid-ext/basic-security/authorization/db/basic/groupMappings/${x}`,
                        {
                            name: `${x}`,
                            groupPattern: x,
                            roles: groupRoleMappings[x],
                        },
                        axiosConfig
                    );
                }
            );

            return Promise.all(createGroupRoleMappingTasks);
        }, retryConfig);
    } catch (e) {
        console.error(
            `Received an error while setting up group mappings, error status: ${
                axios.isAxiosError(e) ? e.status : ''
            }`
        );
    }
}

async function updateGroupRoleMappings(
    groupRoleMappings: Record<string, string[]>
): Promise<void> {
    const axiosConfig = await utils.generateAxiosConfig();

    // get all mappings
    let existingMappings: string[] = [];

    try {
        await axios
            .get<string[]>(
                `${druidEndpoint}/proxy/coordinator/druid-ext/basic-security/authorization/db/basic/groupMappings`,
                axiosConfig
            )
            .then((resp) => (existingMappings = resp.data));

        // sync with mappings from cdk.json, druid doesn't have an update API, we need to delete and recreate
        await backOff(() => {
            const deleteTasks = existingMappings.map((x) =>
                axios.delete(
                    `${druidEndpoint}/proxy/coordinator/druid-ext/basic-security/authorization/db/basic/groupMappings/${x}`,
                    axiosConfig
                )
            );
            return Promise.all(deleteTasks);
        }, retryConfig);

        await backOff(() => {
            const createGroupRoleMappingTasks = Object.keys(groupRoleMappings).map(
                (x) => {
                    return axios.post(
                        `${druidEndpoint}/proxy/coordinator/druid-ext/basic-security/authorization/db/basic/groupMappings/${x}`,
                        {
                            name: `${x}`,
                            groupPattern: x,
                            roles: groupRoleMappings[x],
                        },
                        axiosConfig
                    );
                }
            );

            return Promise.all(createGroupRoleMappingTasks);
        }, retryConfig);
    } catch (e) {
        console.error(
            `Received an error while updating group role mappings, error status: ${
                axios.isAxiosError(e) ? e.status : ''
            }`
        );
    }
}
