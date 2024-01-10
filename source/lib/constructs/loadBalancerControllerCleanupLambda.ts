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
import * as elbv2 from '@aws-sdk/client-elastic-load-balancing-v2';
import * as r53 from '@aws-sdk/client-route-53';
import { v4 as uuidv4 } from 'uuid';

import {
    CloudFormationCustomResourceEvent,
    CloudFormationCustomResourceSuccessResponse,
} from 'aws-lambda';
import { SDK_CLIENT_CONFIG } from '../utils/constants';

const elbv2Client = new elbv2.ElasticLoadBalancingV2Client(SDK_CLIENT_CONFIG);
const route53Client = new r53.Route53Client(SDK_CLIENT_CONFIG);

export async function handler(
    event: CloudFormationCustomResourceEvent
): Promise<CloudFormationCustomResourceSuccessResponse> {
    function success(
        physicalResourceId: string
    ): CloudFormationCustomResourceSuccessResponse {
        return {
            RequestId: event.RequestId,
            LogicalResourceId: event.LogicalResourceId,
            PhysicalResourceId: physicalResourceId,
            StackId: event.StackId,
            Status: 'SUCCESS',
        };
    }
    switch (event.RequestType) {
        case 'Create':
            return success(uuidv4());
        case 'Update':
            return success(event.PhysicalResourceId);
        case 'Delete':
            await cleanUp(event);
            return success(event.PhysicalResourceId);
    }
}

async function cleanUp(event: CloudFormationCustomResourceEvent): Promise<void> {
    const eksClusterId = event.ResourceProperties.eksClusterId;
    const hostedZoneId = event.ResourceProperties.hostedZoneId;
    const aRecordName = event.ResourceProperties.aRecordName;

    try {
        // get all loadbalancers
        const elbs: elbv2.LoadBalancer[] = [];
        let hasMore = true;
        do {
            const result = await elbv2Client.send(
                new elbv2.DescribeLoadBalancersCommand({})
            );

            result.LoadBalancers?.forEach((x) => elbs.push(x));
            hasMore = result.NextMarker !== undefined;
        } while (hasMore);

        // get elb tags
        const tags: elbv2.TagDescription[] = [];

        // describe tags can only do 20 at a time
        const chunks = sliceIntoChunks(elbs, 20);

        await Promise.all(
            chunks.map(async (c) => {
                const result = await elbv2Client.send(
                    new elbv2.DescribeTagsCommand({
                        ResourceArns: c
                            .filter((x) => x.LoadBalancerArn)
                            // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
                            .map((x) => x.LoadBalancerArn!),
                    })
                );

                result.TagDescriptions?.forEach((t) => tags.push(t));
            })
        );

        const elbToDelete = tags.filter(
            (x) =>
                x.Tags?.some(
                    (t) => t.Key === 'elbv2.k8s.aws/cluster' && t.Value === eksClusterId
                )
        );

        await Promise.all(
            elbToDelete.map((x) =>
                elbv2Client.send(
                    new elbv2.DeleteLoadBalancerCommand({
                        LoadBalancerArn: x.ResourceArn,
                    })
                )
            )
        );

        if (hostedZoneId && aRecordName) {
            route53Client.send(
                new r53.ChangeResourceRecordSetsCommand({
                    HostedZoneId: hostedZoneId,
                    ChangeBatch: {
                        Changes: [
                            {
                                Action: 'DELETE',
                                ResourceRecordSet: {
                                    Name: aRecordName,
                                    Type: r53.RRType.A,
                                },
                            },
                        ],
                    },
                })
            );
        }
    } catch (e) {
        console.error(
            `An error occurred while trying to clean up ALBs and Route 53 record, ${JSON.stringify(
                e
            )}`
        );
        // we're not going to fail the execution as this is best effort to clean up resources. Customers still need to clean up s3 etc. manually.
    }
}

function sliceIntoChunks<T>(input: T[], chunkSize: number): T[][] {
    const res = [];
    for (let i = 0; i < input.length; i += chunkSize) {
        const chunk = input.slice(i, i + chunkSize);
        res.push(chunk);
    }
    return res;
}
