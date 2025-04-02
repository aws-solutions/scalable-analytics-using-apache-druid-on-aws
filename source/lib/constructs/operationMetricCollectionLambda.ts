/* 
 Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 SPDX-License-Identifier: Apache-2.0
*/
/* eslint-disable @typescript-eslint/naming-convention */
import * as moment from 'moment';

import {
    CloudFormationCustomResourceEvent,
    CloudFormationCustomResourceSuccessResponse,
} from 'aws-lambda';
import axios, { AxiosRequestConfig } from 'axios';

import { v4 as uuidv4 } from 'uuid';

const METRICS_ENDPOINT = 'https://metrics.awssolutionsbuilder.com/generic';

export async function handler(
    event: CloudFormationCustomResourceEvent
): Promise<CloudFormationCustomResourceSuccessResponse> {
    const {
        awsSolutionId,
        awsSolutionVersion,
        awsRegion,
        retainData,
        hostingPlatform,
        internetFacing,
        druidVersion,
    } = event.ResourceProperties;

    // Randomly generated, unique identifier for each Solution deployment
    let anonymousDataUUID = '';

    switch (event.RequestType) {
        case 'Create':
            // only create anonymous uuid for create event
            anonymousDataUUID = uuidv4();
            break;

        case 'Update':
        case 'Delete':
            anonymousDataUUID = event.PhysicalResourceId;
            break;
    }

    // send anonymous metrics data
    const result = await sendAnonymousMetric({
        awsSolutionId,
        awsSolutionVersion,
        anonymousDataUUID,
        data: {
            region: awsRegion,
            requestType: event.RequestType,
            retainData,
            hostingPlatform,
            internetFacing,
            druidVersion,
        },
    });

    return {
        RequestId: event.RequestId,
        LogicalResourceId: event.LogicalResourceId,
        PhysicalResourceId: anonymousDataUUID,
        Data: {
            anonymousDataUUID,
        },
        StackId: event.StackId,
        Status: 'SUCCESS',
        Reason: result,
    };
}

async function sendAnonymousMetric(payload: Record<string, unknown>): Promise<string> {
    try {
        const payloadStr = JSON.stringify({
            Solution: payload.awsSolutionId,
            Version: payload.awsSolutionVersion,
            UUID: payload.anonymousDataUUID,
            TimeStamp: moment.utc().format('YYYY-MM-DD HH:mm:ss.S'),
            Data: payload.data,
        });

        const config: AxiosRequestConfig = {
            headers: {
                'content-type': 'application/json',
                'content-length': payloadStr.length,
            },
        };

        console.info(`Sending anonymous metric ${JSON.stringify(payloadStr)}`);
        const response = await axios.post(METRICS_ENDPOINT, payloadStr, config);
        console.info(
            `Anonymous metric response: ${response.statusText} (${response.status})`
        );
        return 'Succeeded';
    } catch (err) {
        // Log the error
        console.error(`Error sending anonymous metric: ${JSON.stringify(err)}`);
        return (err as Error).message;
    }
}
