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
