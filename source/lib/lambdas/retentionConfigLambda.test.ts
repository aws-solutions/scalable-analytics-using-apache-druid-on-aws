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

import { CloudFormationCustomResourceEvent } from 'aws-lambda';
import axios from 'axios';
import * as uuid from 'uuid';
import * as handler from './retentionConfigLambda';
import { mockClient } from 'aws-sdk-client-mock';
import {
    GetSecretValueCommand,
    SecretsManagerClient,
} from '@aws-sdk/client-secrets-manager';

jest.mock('axios');
jest.mock('uuid');

const secretsManagerClientMock = mockClient(SecretsManagerClient);

describe('retention config lambda', () => {
    const event = {
        ServiceToken: 'test-service-token',
        ResponseURL: 'https://test-url',
        StackId: 'test-stack-id',
        RequestId: 'test-request-id ',
        LogicalResourceId: 'test-logical-resource-id',
        ResourceType: 'AWS::CloudFormation::CustomResource',
        ResourceProperties: {
            ServiceToken: 'test-service-token',
            retentionRules: [
                {
                    type: 'loadByPeriod',
                    period: 'P1M',
                    includeFuture: true,
                    tieredReplicants: {
                        hot: 1,
                        _default_tier: 1,
                    },
                },
                {
                    type: 'loadByInterval',
                    interval: '2012-01-01/2013-01-01',
                    tieredReplicants: {
                        hot: 1,
                        _default_tier: 1,
                    },
                },
                {
                    type: 'loadForever',
                    tieredReplicants: {
                        hot: 1,
                        _default_tier: 1,
                    },
                },
            ],
        },
    };

    beforeEach(() => {
        jest.resetAllMocks();
        secretsManagerClientMock.reset();
    });

    it('returns a success response when retention rules are successfully created', async () => {
        const mockUUID = 'test-physical-resource-id';

        // Mock the getSystemUserSecret function to return a valid admin user secret
        jest.spyOn(handler, 'getSystemUserSecret').mockResolvedValueOnce(
            JSON.stringify({
                username: 'admin',
                password: 'password',
            })
        );

        jest.spyOn(uuid, 'v4').mockReturnValueOnce(mockUUID);

        // Mock the axios post function to return a 200 status code
        jest.spyOn(axios, 'post').mockResolvedValueOnce({
            status: 200,
        });

        const createEvent: CloudFormationCustomResourceEvent = {
            RequestType: 'Create',
            ...event,
        };
        const result = await handler.onEventHandler(createEvent);

        expect(result.Status).toEqual('SUCCESS');
        expect(result.PhysicalResourceId).toEqual(mockUUID);
        expect(result.RequestId).toEqual(event.RequestId);
    });

    it('returns a success response when retention rules are successfully updated', async () => {
        // Mock the getSystemUserSecret function to return a valid admin user secret
        jest.spyOn(handler, 'getSystemUserSecret').mockResolvedValueOnce(
            JSON.stringify({
                username: 'admin',
                password: 'password',
            })
        );

        // Mock the axios post function to return a 200 status code
        jest.spyOn(axios, 'post').mockResolvedValueOnce({
            status: 200,
        });

        const updateEvent: CloudFormationCustomResourceEvent = {
            RequestType: 'Update',
            PhysicalResourceId: 'test-physical-resource-id',
            OldResourceProperties: {},
            ...event,
        };
        const result = await handler.onEventHandler(updateEvent);

        expect(result.Status).toEqual('SUCCESS');
        expect(result.PhysicalResourceId).toEqual('test-physical-resource-id');
        expect(result.RequestId).toEqual(event.RequestId);
    });

    it('do nothing when delete event is received', async () => {
        // Mock the getSystemUserSecret function to return a valid admin user secret
        const getAdminUserSpy = jest
            .spyOn(handler, 'getSystemUserSecret')
            .mockResolvedValueOnce(
                JSON.stringify({
                    username: 'admin',
                    password: 'password',
                })
            );

        // Mock the axios post function to return a 200 status code
        const axiosPostSpy = jest.spyOn(axios, 'post').mockResolvedValueOnce({
            status: 200,
        });

        const deleteEvent: CloudFormationCustomResourceEvent = {
            RequestType: 'Delete',
            PhysicalResourceId: 'test-physical-resource-id',
            ...event,
        };
        const result = await handler.onEventHandler(deleteEvent);

        expect(getAdminUserSpy).not.toBeCalled();
        expect(axiosPostSpy).not.toBeCalled();

        expect(result.Status).toEqual('SUCCESS');
        expect(result.PhysicalResourceId).toEqual('test-physical-resource-id');
        expect(result.RequestId).toEqual(event.RequestId);
    });

    it('should log error message when getSystemUserSecret fails', async () => {
        // Mock the getSystemUserSecret function to return undefined
        jest.spyOn(handler, 'getSystemUserSecret').mockResolvedValueOnce(undefined);
        jest.spyOn(console, 'error').mockImplementation(() => {});

        const createEvent: CloudFormationCustomResourceEvent = {
            RequestType: 'Create',
            ...event,
        };

        const result = await handler.onEventHandler(createEvent);

        expect(console.error).toBeCalledWith(
            `Failed to configure retention rules: ${JSON.stringify(
                event.ResourceProperties.retentionRules
            )}`
        );
        expect(result.Status).toEqual('SUCCESS');
    });

    it('should log error message when retention rules fail to be configured', async () => {
        // Mock the getSystemUserSecret function to return a valid admin user secret
        jest.spyOn(handler, 'getSystemUserSecret').mockResolvedValueOnce(
            JSON.stringify({
                username: 'admin',
                password: 'password',
            })
        );

        jest.spyOn(global, 'setTimeout');

        // Mock the axios post function to throw an error
        jest.spyOn(axios, 'post').mockRejectedValueOnce(
            new Error('Failed to configure retention rules')
        );
        jest.spyOn(console, 'error').mockImplementation(() => {});

        const createEvent: CloudFormationCustomResourceEvent = {
            RequestType: 'Create',
            ...event,
        };
        const result = await handler.onEventHandler(createEvent);

        expect(console.error).toBeCalledWith(
            `Failed to configure retention rules: ${JSON.stringify(
                event.ResourceProperties.retentionRules
            )}`
        );
        expect(setTimeout).toHaveBeenCalledTimes(5);
        expect(result.Status).toEqual('SUCCESS');
    });

    it('should log error message when coodinator api returns status other than 200', async () => {
        // Mock the getSystemUserSecret function to return a valid admin user secret
        jest.spyOn(handler, 'getSystemUserSecret').mockResolvedValueOnce(
            JSON.stringify({
                username: 'admin',
                password: 'password',
            })
        );

        // Mock the axios post function to throw an error
        jest.spyOn(axios, 'post').mockResolvedValueOnce({
            status: 401,
        });
        jest.spyOn(console, 'error').mockImplementation(() => {});

        const createEvent: CloudFormationCustomResourceEvent = {
            RequestType: 'Create',
            ...event,
        };

        const result = await handler.onEventHandler(createEvent);

        expect(console.error).toBeCalledWith(
            `Failed to configure retention rules: ${JSON.stringify(
                event.ResourceProperties.retentionRules
            )}`
        );
        expect(result.Status).toEqual('SUCCESS');
    });

    it('getSystemUserSecret should return the admin user secret', async () => {
        const secretId = 'test-secret-id';
        const secretValue = {
            username: 'admin',
            password: 'password',
        };

        process.env.SYSTEM_USER_SECRET_ID = secretId;

        secretsManagerClientMock
            .on(GetSecretValueCommand, {
                SecretId: secretId,
            })
            .resolves({
                SecretString: JSON.stringify(secretValue),
            });

        const result = await handler.getSystemUserSecret();

        expect(result).toEqual(JSON.stringify(secretValue));
    });

    it('getSystemUserSecret should return undefined if there is an error', async () => {
        const secretId = 'test-secret-id';

        process.env.SYSTEM_USER_SECRET_ID = secretId;

        secretsManagerClientMock
            .on(GetSecretValueCommand, {
                SecretId: secretId,
            })
            .rejectsOnce();
        const result = await handler.getSystemUserSecret();

        expect(result).not.toBeDefined();
    });
});
