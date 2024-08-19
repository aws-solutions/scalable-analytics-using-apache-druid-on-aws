/* 
 Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 SPDX-License-Identifier: Apache-2.0
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
