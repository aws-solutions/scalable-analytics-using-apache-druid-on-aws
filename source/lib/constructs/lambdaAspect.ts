/* 
 Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 SPDX-License-Identifier: Apache-2.0
*/
import * as cdk from 'aws-cdk-lib';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import { IConstruct } from 'constructs';

export interface LambdaAspectProps {
    readonly solutionId: string;
    readonly solutionVersion: string;
    readonly useFipsEndpoint: boolean;
}

export class LambdaAspect implements cdk.IAspect {
    public constructor(private readonly props: LambdaAspectProps) {}

    public visit(node: IConstruct): void {
        this.applyEnvironmentVariablesAspect(node);
    }

    private applyEnvironmentVariablesAspect(node: IConstruct): void {
        if (node instanceof lambda.Function) {
            node.addEnvironment(
                'USER_AGENT_STRING',
                `AWSSOLUTION/${this.props.solutionId}/${this.props.solutionVersion}`
            );
            node.addEnvironment(
                'AWS_USE_FIPS_ENDPOINT',
                this.props.useFipsEndpoint.toString()
            );
        }
    }
}
