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
export const rules = [
    // AWS IP Reputation list includes known malicious actors/bots and is regularly updated
    {
        name: 'AWS-AWSManagedRulesAmazonIpReputationList',
        rule: {
            name: 'AWS-AWSManagedRulesAmazonIpReputationList',
            priority: 10,
            statement: {
                managedRuleGroupStatement: {
                    vendorName: 'AWS',
                    name: 'AWSManagedRulesAmazonIpReputationList',
                },
            },
            overrideAction: {
                none: {},
            },
            visibilityConfig: {
                sampledRequestsEnabled: true,
                cloudWatchMetricsEnabled: true,
                metricName: 'AWSManagedRulesAmazonIpReputationList',
            },
        },
    },
    // Common Rule Set aligns with major portions of OWASP Core Rule Set
    {
        name: 'AWS-AWSManagedRulesCommonRuleSet',
        rule: {
            name: 'AWS-AWSManagedRulesCommonRuleSet',
            priority: 20,
            statement: {
                managedRuleGroupStatement: {
                    vendorName: 'AWS',
                    name: 'AWSManagedRulesCommonRuleSet',
                    // Excluding generic RFI body rule for sns notifications
                    // https://docs.aws.amazon.com/waf/latest/developerguide/aws-managed-rule-groups-list.html
                    excludedRules: [
                        { name: 'GenericRFI_BODY' },
                        { name: 'SizeRestrictions_BODY' },
                    ],
                },
            },
            overrideAction: {
                none: {},
            },
            visibilityConfig: {
                sampledRequestsEnabled: true,
                cloudWatchMetricsEnabled: true,
                metricName: 'AWS-AWSManagedRulesCommonRuleSet',
            },
        },
    },
    // Blocks common SQL Injection
    {
        name: 'AWSManagedRulesSQLiRuleSet',
        rule: {
            name: 'AWSManagedRulesSQLiRuleSet',
            priority: 30,
            visibilityConfig: {
                sampledRequestsEnabled: true,
                cloudWatchMetricsEnabled: true,
                metricName: 'AWSManagedRulesSQLiRuleSet',
            },
            overrideAction: {
                none: {},
            },
            statement: {
                managedRuleGroupStatement: {
                    vendorName: 'AWS',
                    name: 'AWSManagedRulesSQLiRuleSet',
                    excludedRules: [],
                },
            },
        },
    },
    // Blocks common PHP attacks such as using high risk variables and methods in the body or queries
    {
        name: 'AWSManagedRulePHP',
        rule: {
            name: 'AWSManagedRulePHP',
            priority: 40,
            visibilityConfig: {
                sampledRequestsEnabled: true,
                cloudWatchMetricsEnabled: true,
                metricName: 'AWSManagedRulePHP',
            },
            overrideAction: {
                none: {},
            },
            statement: {
                managedRuleGroupStatement: {
                    vendorName: 'AWS',
                    name: 'AWSManagedRulesPHPRuleSet',
                    excludedRules: [],
                },
            },
        },
    },
    // Blocks attacks targeting LFI(Local File Injection) for linux systems
    {
        name: 'AWSManagedRuleLinux',
        rule: {
            name: 'AWSManagedRuleLinux',
            priority: 50,
            visibilityConfig: {
                sampledRequestsEnabled: true,
                cloudWatchMetricsEnabled: true,
                metricName: 'AWSManagedRuleLinux',
            },
            overrideAction: {
                none: {},
            },
            statement: {
                managedRuleGroupStatement: {
                    vendorName: 'AWS',
                    name: 'AWSManagedRulesLinuxRuleSet',
                    excludedRules: [],
                },
            },
        },
    },
];
