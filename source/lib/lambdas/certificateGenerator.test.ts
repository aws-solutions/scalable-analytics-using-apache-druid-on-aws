/* 
 Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 SPDX-License-Identifier: Apache-2.0
*/
/* eslint-disable @typescript-eslint/naming-convention */
/* eslint-disable @typescript-eslint/no-explicit-any */

import * as fs from 'fs';

import { CloudFormationCustomResourceEvent } from 'aws-lambda';
import { onEventHandler } from './certificateGenerator';

const mockedSecretsManager = jest.fn();

jest.mock('@aws-sdk/client-secrets-manager', () => ({
    ...(jest.requireActual('@aws-sdk/client-secrets-manager') as any),
    SecretsManagerClient: jest.fn().mockImplementation(() => ({
        send: (...args: any[]): any => Promise.resolve(mockedSecretsManager(...args)),
    })),
}));

const event: CloudFormationCustomResourceEvent = {
    ServiceToken: '1234',
    RequestType: 'Create',
    ResponseURL: '',
    StackId: '',
    RequestId: '',
    LogicalResourceId: '',
    ResourceType: '',
    ResourceProperties: {
        ServiceToken: '1234',
        TLSSecretId: 'SecretId',
    },
};

describe('onEventHandler', () => {
    beforeEach(() => {
        jest.resetAllMocks();
        jest.spyOn(fs, 'readFileSync').mockImplementation(() => Buffer.from('test'));
        jest.spyOn(fs, 'writeFileSync').mockImplementation(() => {});
    });

    it('can handle create events', async () => {
        // arrange
        mockedSecretsManager.mockResolvedValueOnce({});

        // act
        const result = await onEventHandler(event);

        // assert
        expect(result.Status).toBe('SUCCESS');
    });
});
