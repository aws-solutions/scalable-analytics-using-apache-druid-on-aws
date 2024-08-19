/* 
 Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 SPDX-License-Identifier: Apache-2.0
*/
/* eslint-disable @typescript-eslint/naming-convention */
import { Construct } from 'constructs';
import { IAspect, CfnResource } from 'aws-cdk-lib';

const METADATA_TYPE = 'cfn_nag';
const SUPRESSION_KEY = 'rules_to_suppress';

export interface CfnNagRuleSuppression {
    id: string;
    reason: string;
}

/**
 * Adds cfn nag suppressions to the given construct
 */
function addCfnNagSuppressionMeta(
    construct: CfnResource,
    rulesToSuppress: CfnNagRuleSuppression[]
): void {
    construct.cfnOptions.metadata = {
        ...construct.cfnOptions.metadata,
        [METADATA_TYPE]: {
            ...construct.cfnOptions.metadata?.cfn_nag,
            [SUPRESSION_KEY]: [
                ...(construct.cfnOptions.metadata?.cfn_nag?.rules_to_suppress || []),
                ...rulesToSuppress,
            ],
        },
    };
}

export function addCfnNagSuppression(
    construct: Construct,
    rulesToSuppress: CfnNagRuleSuppression[],
    resourceName?: string
): void {
    const child = resourceName ? construct.node.findChild(resourceName) : construct;
    // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
    if (child) {
        addCfnNagSuppressionMeta(child.node.defaultChild as CfnResource, rulesToSuppress);
    }
}

export class CfnNagResourcePathRulesSuppressionAspect implements IAspect {
    public static readonly W58_REASON =
        'Lambda already has the required permission to write CloudWatch Logs via arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole.';
    public static readonly W89_REASON =
        'Custom resource lambda functions is not necessary to be deployed in a VPC';
    public static readonly W92_REASON =
        'Custom resource lambda function is created by CDK and CloudFormation';

    public constructor(
        private readonly resourcePathRules: Record<string, CfnNagRuleSuppression[]>
    ) {}

    public visit(construct: Construct): void {
        Object.keys(this.resourcePathRules).forEach((resourcePath) => {
            if (resourcePath.endsWith('$')) {
                if (construct.node.path.match(new RegExp(resourcePath))) {
                    addCfnNagSuppressionMeta(
                        construct as CfnResource,
                        this.resourcePathRules[resourcePath]
                    );
                }
            } else {
                if (construct.node.path.endsWith(resourcePath)) {
                    addCfnNagSuppressionMeta(
                        construct as CfnResource,
                        this.resourcePathRules[resourcePath]
                    );
                }
            }
        });
    }
}
