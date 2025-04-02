/* 
 Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 SPDX-License-Identifier: Apache-2.0
*/

import * as cdk from 'aws-cdk-lib';
import { aws_s3 as s3 } from 'aws-cdk-lib';
import { Template } from 'aws-cdk-lib/assertions';

import { addCfnGuardSuppression } from '../cfnGuardHelper';

let stack: cdk.Stack;

beforeEach(() => {
    const app = new cdk.App();
    stack = new cdk.Stack(app, 'TestStack');
});

test('add multiple suppressions', () => {
    const cfnBucket = new s3.Bucket(stack, 'TestBucket');
    // Add multiple suppressions
    addCfnGuardSuppression(cfnBucket, [
        { id: 'S3_BUCKET_NO_PUBLIC_RW_ACL', reason: 'test' },
        { id: 'S3_BUCKET_ANOTHER_SUPPRESSED_RULE', reason: 'test' },
    ]);

    Template.fromStack(stack).hasResource('AWS::S3::Bucket', {
        // eslint-disable-next-line @typescript-eslint/naming-convention
        Metadata: {
            // eslint-disable-next-line @typescript-eslint/naming-convention
            guard: {
                // eslint-disable-next-line @typescript-eslint/naming-convention
                SuppressedRules: [
                    { id: 'S3_BUCKET_NO_PUBLIC_RW_ACL', reason: 'test' },
                    { id: 'S3_BUCKET_ANOTHER_SUPPRESSED_RULE', reason: 'test' },
                ],
            },
        },
    });
});
