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
/* eslint-disable @typescript-eslint/no-explicit-any */

import { CloudFormationCustomResourceEvent } from 'aws-lambda';
import { handler } from './appRegistryWaiterLambda';

const mockGetApplication = jest.fn();

jest.mock('@aws-sdk/client-service-catalog-appregistry', () => ({
    ...(jest.requireActual('@aws-sdk/client-service-catalog-appregistry') as any),
    ServiceCatalogAppRegistryClient: jest.fn().mockImplementation(() => ({
        send: (...args: any[]): any => Promise.resolve(mockGetApplication(...args)),
    })),
}));

const baseEvent: CloudFormationCustomResourceEvent = {
    RequestType: 'Create',
    StackId: 'StackId',
    ServiceToken: 'ServiceToken',
    RequestId: 'RequestId',
    ResponseURL: 'ResponseURL',
    LogicalResourceId: 'LogicalResourceId',
    ResourceType: 'ResourceType',
    ResourceProperties: {
        ServiceToken: 'ServiceToken',
        applicationId: 'applicationId',
    },
};

const baseUpdateEvent: CloudFormationCustomResourceEvent = {
    ...baseEvent,
    PhysicalResourceId: 'PhysicalResourceId',
    RequestType: 'Update',
    OldResourceProperties: {},
};

const baseDeleteEvent: CloudFormationCustomResourceEvent = {
    ...baseEvent,
    PhysicalResourceId: 'PhysicalResourceId',
    RequestType: 'Delete',
};

describe('handler', () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    it('should return IsComplete true to ensure disable async waiter when RequestType is Delete', async () => {
        const result = await handler(baseDeleteEvent);
        expect(result).toEqual({
            IsComplete: true,
        });
    });

    describe.each([
        ['Create', baseEvent],
        ['Update', baseUpdateEvent],
    ])('For RqeuestType %p', (_: string, event: CloudFormationCustomResourceEvent) => {
        it('should return IsComplete false if Application integrations is unknown', async () => {
            mockGetApplication.mockReturnValue({});
            const result = await handler(event);
            expect(result).toEqual({
                IsComplete: false,
            });
        });

        it('should return IsComplete false if Resource Group is unknown', async () => {
            mockGetApplication.mockReturnValue({
                integrations: {},
            });
            const result = await handler(event);
            expect(result).toEqual({
                IsComplete: false,
            });
        });

        it('should return IsComplete false if Resource Group state is unknown', async () => {
            mockGetApplication.mockReturnValue({
                integrations: {
                    resourceGroup: {},
                },
            });
            const result = await handler(event);
            expect(result).toEqual({
                IsComplete: false,
            });
        });

        it('should return IsComplete false if Resource Group state is CREATING', async () => {
            mockGetApplication.mockReturnValue({
                integrations: {
                    resourceGroup: {
                        state: 'CREATING',
                    },
                },
            });
            const result = await handler(event);
            expect(result).toEqual({
                IsComplete: false,
            });
        });

        it('should return IsComplete false if Resource Group state is UPDATING', async () => {
            mockGetApplication.mockReturnValue({
                integrations: {
                    resourceGroup: {
                        state: 'UPDATING',
                    },
                },
            });
            const result = await handler(event);
            expect(result).toEqual({
                IsComplete: false,
            });
        });

        it('should return IsComplete true if Resource Group state is CREATE_COMPLETE', async () => {
            mockGetApplication.mockReturnValue({
                integrations: {
                    resourceGroup: {
                        state: 'CREATE_COMPLETE',
                    },
                },
            });
            const result = await handler(event);
            expect(result).toEqual({
                IsComplete: true,
            });
        });

        it('should return IsComplete true if Resource Group state is UPDATE_COMPLETE', async () => {
            mockGetApplication.mockReturnValue({
                integrations: {
                    resourceGroup: {
                        state: 'UPDATE_COMPLETE',
                    },
                },
            });
            const result = await handler(event);
            expect(result).toEqual({
                IsComplete: true,
            });
        });

        it('should throw Error if Resource Group state is CREATE_FAILED', async () => {
            mockGetApplication.mockReturnValue({
                integrations: {
                    resourceGroup: {
                        state: 'CREATE_FAILED',
                    },
                },
            });

            await expect(async () => handler(event)).rejects.toThrowError(
                'Application Resource Group is in CREATE_FAILED'
            );
        });

        it('should throw Error if Resource Group state is UPDATE_FAILED', async () => {
            mockGetApplication.mockReturnValue({
                integrations: {
                    resourceGroup: {
                        state: 'UPDATE_FAILED',
                    },
                },
            });

            await expect(handler(event)).rejects.toThrowError(
                'Application Resource Group is in UPDATE_FAILED'
            );
        });

        it('should throw Error if GetApplication call throws Error', async () => {
            mockGetApplication.mockImplementation(async () => {
                throw new Error('Mock Error');
            });

            await expect(handler(event)).rejects.toThrowError('Mock Error');
        });
    });
});
