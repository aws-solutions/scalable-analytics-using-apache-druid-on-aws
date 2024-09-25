/* 
 Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 SPDX-License-Identifier: Apache-2.0
*/
/* eslint-disable @typescript-eslint/naming-convention */
import {
    CloudFormationCustomResourceEvent,
    CloudFormationCustomResourceFailedResponse,
    CloudFormationCustomResourceSuccessResponse,
} from 'aws-lambda';
import {
    GetSecretValueCommand,
    SecretsManagerClient,
} from '@aws-sdk/client-secrets-manager';

import axios, { AxiosRequestConfig } from 'axios';
import { RetentionRule } from '../utils/types';
import * as handler from './retentionConfigLambda';

import { v4 as uuidv4 } from 'uuid';
import { SDK_CLIENT_CONFIG } from '../utils/constants';

enum ResponseType {
    SUCCESS = 'SUCCESS',
    FAILED = 'FAILED',
}

export async function onEventHandler(
    event: CloudFormationCustomResourceEvent
): Promise<
    | CloudFormationCustomResourceSuccessResponse
    | CloudFormationCustomResourceFailedResponse
> {
    const { retentionRules } = event.ResourceProperties;

    console.info(
        `Received ${event.RequestType} event: ${JSON.stringify(retentionRules)}`
    );

    let physicalResourceId = '';
    let result = ResponseType.SUCCESS;

    switch (event.RequestType) {
        case 'Create':
            physicalResourceId = uuidv4();
            result = await configureRetentionRules(retentionRules);
            break;

        case 'Update':
            physicalResourceId = event.PhysicalResourceId;
            result = await configureRetentionRules(retentionRules);
            break;

        case 'Delete':
            // Don't take any action on delete.
            // This is to prevent unintentional retention rules from being deleted.
            physicalResourceId = event.PhysicalResourceId;
            break;
    }

    if (result === ResponseType.FAILED) {
        console.error(
            `Failed to configure retention rules: ${JSON.stringify(retentionRules)}`
        );
    }

    return {
        RequestId: event.RequestId,
        LogicalResourceId: event.LogicalResourceId,
        PhysicalResourceId: physicalResourceId,
        StackId: event.StackId,
        // Always return success to proceed with the deployment
        Status: 'SUCCESS',
    };
}

export async function getSystemUserSecret(): Promise<string | undefined> {
    const client = new SecretsManagerClient(SDK_CLIENT_CONFIG);
    const command = new GetSecretValueCommand({
        SecretId: process.env.SYSTEM_USER_SECRET_ID,
    });

    try {
        const response = await client.send(command);
        return response.SecretString;
    } catch (error) {
        console.error(error);
    }

    return undefined;
}

export async function generateAxiosConfig(): Promise<AxiosRequestConfig | undefined> {
    const druidSecret = await getSystemUserSecret();

    if (!druidSecret) {
        // do nothing, error logging is handled by getSystemUserSecret function
        return undefined;
    }

    const credentials = JSON.parse(druidSecret);

    const axiosConfig = {
        headers: { 'content-type': 'application/json' },
        auth: {
            username: credentials.username,
            password: credentials.password,
        },
    };

    return axiosConfig;
}

export async function configureRetentionRules(
    retentionRules: RetentionRule[]
): Promise<ResponseType> {
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    const druidEndpoint = process.env['DRUID_ENDPOINT']!;
    const maxRetries = process.env['NUM_OF_ATTEMPTS']
        ? parseInt(process.env['NUM_OF_ATTEMPTS'])
        : 5;
    const delayMs = process.env['STARTING_DELAY']
        ? parseInt(process.env['STARTING_DELAY'])
        : 5000;

    const axiosConfig = await handler.generateAxiosConfig();

    let numRetries = 0;
    while (numRetries < maxRetries) {
        try {
            const response = await axios.post(
                `${druidEndpoint}/druid/coordinator/v1/rules/_default`,
                retentionRules,
                axiosConfig
            );

            if (response.status !== 200) {
                console.error(
                    `Failed to configure retention rules: ${response.statusText} (${response.status})`
                );
                return ResponseType.FAILED;
            }

            console.info('Successfully configured retention rules');
            return ResponseType.SUCCESS;
        } catch (err) {
            numRetries++;

            console.error(
                `Attempt ${numRetries} failed when configuring retention rules with error status: ${
                    axios.isAxiosError(err) ? err.status : ''
                }`
            );

            await new Promise((resolve) => {
                // backoff exponentially
                const delayInterval = Math.min(delayMs * 2 ** numRetries, 60000);
                setTimeout(resolve, delayInterval);
            });
        }
    }
    return ResponseType.FAILED;
}
