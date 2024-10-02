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
