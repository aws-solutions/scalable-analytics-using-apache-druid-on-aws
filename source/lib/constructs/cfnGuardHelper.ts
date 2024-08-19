/* 
 Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 SPDX-License-Identifier: Apache-2.0
*/

/* eslint-disable @typescript-eslint/naming-convention */
import { Construct } from 'constructs';
import { IAspect, CfnResource } from 'aws-cdk-lib';

const METADATA_TYPE = 'guard';
const SUPRESSION_KEY = 'SuppressedRules';

export interface CfnGuardRuleSuppression {
    id: string;
    reason: string;
}

/**
 * Adds cfn nag suppressions to the given construct
 */
function addCfnGuardSuppressionMeta(
    construct: CfnResource,
    guard: CfnGuardRuleSuppression[]
): void {
    construct.cfnOptions.metadata = {
        ...construct.cfnOptions.metadata,
        [METADATA_TYPE]: {
            ...construct.cfnOptions.metadata?.guard,
            [SUPRESSION_KEY]: [
                ...(construct.cfnOptions.metadata?.guard?.SuppressedRules || []),
                ...guard,
            ],
        },
    };
}

export function addCfnGuardSuppression(
    construct: Construct,
    guard: CfnGuardRuleSuppression[],
    resourceName?: string
): void {
    const child = resourceName ? construct.node.findChild(resourceName) : construct;
    // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
    if (child) {
        addCfnGuardSuppressionMeta(child.node.defaultChild as CfnResource, guard);
    }
}

export class CfnGuardResourcePathRulesSuppressionAspect implements IAspect {
    public constructor(
        private readonly resourcePathRules: Record<string, CfnGuardRuleSuppression[]>
    ) {}

    public visit(construct: Construct): void {
        Object.keys(this.resourcePathRules).forEach((resourcePath) => {
            if (resourcePath.endsWith('$')) {
                if (construct.node.path.match(new RegExp(resourcePath))) {
                    addCfnGuardSuppressionMeta(
                        construct as CfnResource,
                        this.resourcePathRules[resourcePath]
                    );
                }
            } else {
                if (construct.node.path.endsWith(resourcePath)) {
                    addCfnGuardSuppressionMeta(
                        construct as CfnResource,
                        this.resourcePathRules[resourcePath]
                    );
                }
            }
        });
    }
}
