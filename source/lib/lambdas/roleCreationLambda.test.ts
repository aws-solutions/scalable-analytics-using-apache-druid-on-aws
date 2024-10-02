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

import * as utils from './retentionConfigLambda';

import { CloudFormationCustomResourceEvent } from 'aws-lambda';
import axios from 'axios';
import { onEventHandler } from './roleCreationLambda';

jest.mock('axios');
jest.mock('./retentionConfigLambda');

const mockedAxios = jest.mocked(axios);
const mockedUtils = jest.mocked(utils);

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
        groupRoleMappings: {
            group1: ['manage'],
            group2: ['read'],
            group3: ['write'],
            group4: ['administrator'],
        },
    },
};

describe('onEventHandler', () => {
    beforeEach(() => {
        jest.resetAllMocks();
    });

    it('can handle create events', async () => {
        // arrange
        mockedUtils.getSystemUserSecret.mockResolvedValueOnce(
            JSON.stringify({ username: 'test', password: 'test' })
        );

        mockedAxios.post.mockImplementation(() => Promise.resolve({}));

        // act
        const result = await onEventHandler(event);

        // assert
        expect(result.Status).toBe('SUCCESS');
        expect(axios.post).toHaveBeenCalledTimes(12);
    });

    it('do nothing on other events', async () => {
        // act
        await onEventHandler({
            ...event,
            RequestType: 'Delete',
            PhysicalResourceId: 'some-id',
        });

        // assert
        expect(axios.post).not.toHaveBeenCalled();
        expect(utils.getSystemUserSecret).not.toHaveBeenCalled();
    });

    it('do not blow up on exception', async () => {
        // arrange
        mockedAxios.post.mockImplementation(() => Promise.reject('error'));

        // act
        const result = await onEventHandler({ ...event });

        // assert
        expect(result.Status).toBe('SUCCESS');
    });

    it('can handle update events', async () => {
        // arrange
        mockedUtils.getSystemUserSecret.mockResolvedValueOnce(
            JSON.stringify({ username: 'test', password: 'test' })
        );

        mockedAxios.get.mockResolvedValueOnce({ data: ['map1', 'map2', 'map3'] });
        mockedAxios.post.mockImplementation(() => Promise.resolve({}));

        // act
        const result = await onEventHandler({
            ...event,
            RequestType: 'Update',
            PhysicalResourceId: '',
            OldResourceProperties: {},
        });

        // assert

        expect(result.Status).toBe('SUCCESS');
        expect(axios.delete).toHaveBeenCalledTimes(3);
        expect(axios.post).toHaveBeenCalledTimes(4);
        expect(axios.get).toHaveBeenCalledTimes(1);
    });
});
