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
import * as cw from 'aws-cdk-lib/aws-cloudwatch';

import { Construct } from 'constructs';
import { DRUID_METRICS_NAMESPACE } from '../utils/constants';

export const commonGraphWidgetProps = {
    width: 6,
    height: 6,
    liveData: true,
};

export const commonTextWidgetProps = {
    width: 24,
    height: 1,
};

export interface MonitoringDashboardProps {
    druidClusterName: string;
    computeWidgets: cw.IWidget[];
    metadataDatabaseWidget: cw.IWidget[];
    deepStorageBucketName: string;
    canaryName?: string;
    albName?: string;
}

export class MonitoringDashboard extends Construct {
    public constructor(scope: Construct, id: string, props: MonitoringDashboardProps) {
        super(scope, id);

        const dashboard = new cw.Dashboard(this, 'monitoring-dashboard', {
            dashboardName: `druid-${props.druidClusterName}-ops-dashboard`,
        });

        if (props.canaryName) {
            dashboard.addWidgets(
                new cw.GraphWidget({
                    title: 'Canary status',
                    ...commonGraphWidgetProps,
                    left: [
                        new cw.Metric({
                            metricName: 'SuccessPercent',
                            namespace: 'CloudWatchSynthetics',
                            label: 'Canary Status',
                            statistic: 'avg',
                            unit: cw.Unit.PERCENT,
                            // eslint-disable-next-line @typescript-eslint/naming-convention
                            dimensionsMap: { CanaryName: props.canaryName },
                        }),
                    ],
                })
            );
        }
        if (props.albName) {
            dashboard.addWidgets(...this.createAlbWidgets(props.albName));
        }
        dashboard.addWidgets(
            ...this.createDruidServiceWidgets(
                props.druidClusterName,
                props.deepStorageBucketName
            )
        );

        dashboard.addWidgets(...props.computeWidgets);
        dashboard.addWidgets(...props.metadataDatabaseWidget);
    }

    private createAlbWidgets(albName: string): cw.IWidget[] {
        return [
            new cw.TextWidget({
                ...commonTextWidgetProps,
                markdown: `### Application Load Balancer ${albName} - Key Performance Indicators`,
            }),
            new cw.GraphWidget({
                title: 'Request Count',
                ...commonGraphWidgetProps,
                left: [
                    new cw.Metric({
                        namespace: 'AWS/ApplicationELB',
                        period: cdk.Duration.minutes(1),
                        statistic: 'sum',
                        dimensionsMap: {
                            // eslint-disable-next-line @typescript-eslint/naming-convention
                            LoadBalancer: albName,
                        },
                        metricName: 'RequestCount',
                    }),
                ],
            }),
            new cw.GraphWidget({
                title: 'Target Response Time',
                ...commonGraphWidgetProps,
                left: [
                    new cw.Metric({
                        namespace: 'AWS/ApplicationELB',
                        period: cdk.Duration.minutes(1),
                        statistic: 'avg',
                        dimensionsMap: {
                            // eslint-disable-next-line @typescript-eslint/naming-convention
                            LoadBalancer: albName,
                        },
                        metricName: 'TargetResponseTime',
                    }),
                ],
            }),
            new cw.GraphWidget({
                title: 'HTTP Connection Count',
                ...commonGraphWidgetProps,
                left: [
                    new cw.Metric({
                        namespace: 'AWS/ApplicationELB',
                        period: cdk.Duration.minutes(1),
                        statistic: 'sum',
                        dimensionsMap: {
                            // eslint-disable-next-line @typescript-eslint/naming-convention
                            LoadBalancer: albName,
                        },
                        metricName: 'ActiveConnectionCount',
                    }),
                    new cw.Metric({
                        namespace: 'AWS/ApplicationELB',
                        period: cdk.Duration.minutes(1),
                        statistic: 'sum',
                        dimensionsMap: {
                            // eslint-disable-next-line @typescript-eslint/naming-convention
                            LoadBalancer: albName,
                        },
                        metricName: 'NewConnectionCount',
                    }),
                    new cw.Metric({
                        namespace: 'AWS/ApplicationELB',
                        period: cdk.Duration.minutes(1),
                        statistic: 'sum',
                        dimensionsMap: {
                            // eslint-disable-next-line @typescript-eslint/naming-convention
                            LoadBalancer: albName,
                        },
                        metricName: 'RejectedConnectionCount',
                    }),
                ],
            }),
            new cw.GraphWidget({
                title: 'Response Code Count',
                ...commonGraphWidgetProps,
                left: [
                    new cw.Metric({
                        namespace: 'AWS/ApplicationELB',
                        period: cdk.Duration.minutes(1),
                        statistic: 'sum',
                        dimensionsMap: {
                            // eslint-disable-next-line @typescript-eslint/naming-convention
                            LoadBalancer: albName,
                        },
                        metricName: 'HTTPCode_Target_5XX_Count',
                    }),
                    new cw.Metric({
                        namespace: 'AWS/ApplicationELB',
                        period: cdk.Duration.minutes(1),
                        statistic: 'sum',
                        dimensionsMap: {
                            // eslint-disable-next-line @typescript-eslint/naming-convention
                            LoadBalancer: albName,
                        },
                        metricName: 'HTTPCode_Target_4XX_Count',
                    }),
                    new cw.Metric({
                        namespace: 'AWS/ApplicationELB',
                        period: cdk.Duration.minutes(1),
                        statistic: 'sum',
                        dimensionsMap: {
                            // eslint-disable-next-line @typescript-eslint/naming-convention
                            LoadBalancer: albName,
                        },
                        metricName: 'HTTPCode_Target_2XX_Count',
                    }),
                    new cw.Metric({
                        namespace: 'AWS/ApplicationELB',
                        period: cdk.Duration.minutes(1),
                        statistic: 'sum',
                        dimensionsMap: {
                            // eslint-disable-next-line @typescript-eslint/naming-convention
                            LoadBalancer: albName,
                        },
                        metricName: 'HTTPCode_Target_3XX_Count',
                    }),
                ],
            }),
        ];
    }

    private createDruidServiceWidgets(
        druidClusterName: string,
        deepStorageBucketName: string
    ): cw.IWidget[] {
        return [
            new cw.TextWidget({
                ...commonTextWidgetProps,
                markdown: `### Druid - Key Performance Indicators`,
            }),
            new cw.GraphWidget({
                title: 'Deep Storage',
                ...commonGraphWidgetProps,
                left: [
                    new cw.Metric({
                        namespace: 'AWS/S3',
                        period: cdk.Duration.days(1),
                        statistic: 'avg',
                        dimensionsMap: {
                            /* eslint-disable @typescript-eslint/naming-convention */
                            StorageType: 'StandardStorage',
                            BucketName: deepStorageBucketName,
                            /* eslint-enable */
                        },
                        metricName: 'BucketSizeBytes',
                        unit: cw.Unit.BYTES,
                    }),
                ],
                right: [
                    new cw.Metric({
                        namespace: 'AWS/S3',
                        period: cdk.Duration.days(1),
                        statistic: 'avg',
                        dimensionsMap: {
                            /* eslint-disable @typescript-eslint/naming-convention */
                            StorageType: 'AllStorageTypes',
                            BucketName: deepStorageBucketName,
                            /* eslint-enable */
                        },
                        metricName: 'NumberOfObjects',
                        unit: cw.Unit.COUNT,
                    }),
                ],
            }),
            new cw.GraphWidget({
                title: 'Ingestion Count',
                ...commonGraphWidgetProps,
                left: [
                    new cw.MathExpression({
                        expression: `SEARCH('Namespace="${DRUID_METRICS_NAMESPACE}" MetricName="ingest/events/processed" "Druid.Service"="druid/middleManager" "Druid.Cluster"="${druidClusterName}" "dataSource"', 'Sum', 60)`,
                        usingMetrics: {},
                        label: '',
                    }),
                    new cw.MathExpression({
                        expression: `SEARCH('Namespace="${DRUID_METRICS_NAMESPACE}" MetricName="ingest/events/duplicate" "Druid.Service"="druid/middleManager" "Druid.Cluster"="${druidClusterName}" "dataSource"', 'Sum', 60)`,
                        usingMetrics: {},
                        label: '',
                    }),
                    new cw.MathExpression({
                        expression: `SEARCH('Namespace="${DRUID_METRICS_NAMESPACE}" MetricName="ingest/rows/output" "Druid.Service"="druid/middleManager" "Druid.Cluster"="${druidClusterName}" "dataSource"', 'Sum', 60)`,
                        usingMetrics: {},
                        label: '',
                    }),
                ],
                leftYAxis: { label: 'Count', showUnits: false },
            }),
            new cw.GraphWidget({
                title: 'Query Count',
                ...commonGraphWidgetProps,
                left: [
                    new cw.Metric({
                        namespace: DRUID_METRICS_NAMESPACE,
                        period: cdk.Duration.minutes(1),
                        dimensionsMap: {
                            // eslint-disable-next-line @typescript-eslint/naming-convention
                            'Druid.Service': 'druid/historical',
                            // eslint-disable-next-line @typescript-eslint/naming-convention
                            'Druid.Cluster': druidClusterName,
                        },
                        metricName: 'query/count',
                    }),
                    new cw.Metric({
                        namespace: DRUID_METRICS_NAMESPACE,
                        period: cdk.Duration.minutes(1),
                        dimensionsMap: {
                            // eslint-disable-next-line @typescript-eslint/naming-convention
                            'Druid.Service': 'druid/historical',
                            // eslint-disable-next-line @typescript-eslint/naming-convention
                            'Druid.Cluster': druidClusterName,
                        },
                        metricName: 'query/success/count',
                    }),
                    new cw.Metric({
                        namespace: DRUID_METRICS_NAMESPACE,
                        period: cdk.Duration.minutes(1),
                        dimensionsMap: {
                            // eslint-disable-next-line @typescript-eslint/naming-convention
                            'Druid.Service': 'druid/historical',
                            // eslint-disable-next-line @typescript-eslint/naming-convention
                            'Druid.Cluster': druidClusterName,
                        },
                        metricName: 'query/failed/count',
                    }),
                    new cw.Metric({
                        namespace: DRUID_METRICS_NAMESPACE,
                        period: cdk.Duration.minutes(1),
                        dimensionsMap: {
                            // eslint-disable-next-line @typescript-eslint/naming-convention
                            'Druid.Service': 'druid/historical',
                            // eslint-disable-next-line @typescript-eslint/naming-convention
                            'Druid.Cluster': druidClusterName,
                        },
                        metricName: 'query/interrupted/count',
                    }),
                ],
            }),
            new cw.GraphWidget({
                title: 'Query Time',
                ...commonGraphWidgetProps,
                left: [
                    new cw.MathExpression({
                        expression: `SEARCH('Namespace="${DRUID_METRICS_NAMESPACE}" MetricName="query/time" "Druid.Service"="druid/broker" "Druid.Cluster"="${druidClusterName}" "success"="true" "dataSource"', 'tm99', 60)`,
                        usingMetrics: {},
                        label: '',
                    }),
                ],
                leftYAxis: { label: 'Milliseconds', showUnits: false },
            }),
        ];
    }
}
