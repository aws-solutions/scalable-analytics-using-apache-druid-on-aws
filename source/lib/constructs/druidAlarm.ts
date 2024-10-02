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
import * as actions from 'aws-cdk-lib/aws-cloudwatch-actions';
import * as cw from 'aws-cdk-lib/aws-cloudwatch';
import * as sns from 'aws-cdk-lib/aws-sns';
import * as kms from 'aws-cdk-lib/aws-kms';

import { Construct } from 'constructs';
import { Duration, RemovalPolicy } from 'aws-cdk-lib';
import { DRUID_METRICS_NAMESPACE } from '../utils/constants';

export const commonAlarmProps = {
    comparisonOperator: cw.ComparisonOperator.GREATER_THAN_THRESHOLD,
    threshold: 85,
    datapointsToAlarm: 3,
    evaluationPeriods: 5,
    treatMissingData: cw.TreatMissingData.NOT_BREACHING,
};

interface DruidAlarmsProps {
    druidClusterName: string;
    // For byo database, there is no cluster db identifier
    dbIdentifier?: string;
    loadBalancerFullName?: string;
    targetGroupName?: string;
    zookeeperNodeCount: number;
    computeAlarms: cw.Alarm[];
    removalPolicy: RemovalPolicy;
}

export class DruidAlarms extends Construct {
    public constructor(scope: Construct, id: string, props: DruidAlarmsProps) {
        super(scope, id);
        const topic = new sns.Topic(this, 'alarm-topic', {
            masterKey: new kms.Key(this, 'alarm-topic-encryption-key', {
                enableKeyRotation: true,
                removalPolicy: props.removalPolicy,
            }),
        });

        const alarms: cw.Alarm[] = [];

        // create ZooKeeper alarms
        alarms.push(
            ...this.createZookeeperAlarms(
                props.druidClusterName,
                props.zookeeperNodeCount
            )
        );

        // create RDS alarms
        if (props.dbIdentifier) {
            alarms.push(...this.createRdsAlarms(props.dbIdentifier));
        }

        // create ALB alarms
        if (props.loadBalancerFullName && props.targetGroupName) {
            alarms.push(
                ...this.createAlbAlarms(props.loadBalancerFullName, props.targetGroupName)
            );
        }

        // create Druid alarms based on application metrics
        alarms.push(...this.createDruidAlarms(props.druidClusterName));

        alarms.push(...props.computeAlarms);

        alarms.forEach((alarm) => {
            alarm.addAlarmAction(new actions.SnsAction(topic));
        });
    }

    private createRdsAlarms(dbIdentifier: string): cw.Alarm[] {
        const alarms: cw.Alarm[] = [];
        const commonDimensions = {
            DBClusterIdentifier: dbIdentifier,
        };

        const cpuUtilizationAlarm = this.createAlarm(
            'Druid_RDS_CPU_Utilization',
            this.createMetric(
                'AWS/RDS',
                'CPUUtilization',
                5,
                'Average',
                commonDimensions
            ),
            cw.ComparisonOperator.GREATER_THAN_THRESHOLD,
            75,
            3,
            5,
            cw.TreatMissingData.NOT_BREACHING
        );
        alarms.push(cpuUtilizationAlarm);

        return alarms;
    }

    private createZookeeperAlarms(
        druidClusterName: string,
        zookeeperInstanceCount: number
    ): cw.Alarm[] {
        const alarms: cw.Alarm[] = [];
        const commonDimensions = {
            'Druid.Cluster': druidClusterName,
            'Druid.Service': 'ZooKeeper',
        };

        for (let i = 1; i <= zookeeperInstanceCount; i++) {
            const zkMaxLatencyAlarm = this.createAlarm(
                `zk_max_latency_alarm_${i}`,
                this.createMetric(DRUID_METRICS_NAMESPACE, 'zk_max_latency', 5, 'P99', {
                    ...commonDimensions,
                    'ZooKeeper.ID': i.toString(),
                }),
                cw.ComparisonOperator.GREATER_THAN_THRESHOLD,
                3000,
                3,
                5,
                cw.TreatMissingData.MISSING
            );
            alarms.push(zkMaxLatencyAlarm);

            const zkOutstandingRequestsAlarm = this.createAlarm(
                `zk_outstanding_requests_alarm_${i}`,
                this.createMetric(
                    DRUID_METRICS_NAMESPACE,
                    'zk_outstanding_requests',
                    5,
                    'P99',
                    {
                        ...commonDimensions,
                        'ZooKeeper.ID': i.toString(),
                    }
                ),
                cw.ComparisonOperator.GREATER_THAN_THRESHOLD,
                50,
                3,
                3,
                cw.TreatMissingData.MISSING
            );
            alarms.push(zkOutstandingRequestsAlarm);
        }
        return alarms;
    }

    private createAlbAlarms(
        loadBalancerFullName: string,
        targetGroupName: string
    ): cw.Alarm[] {
        const alarms: cw.Alarm[] = [];
        const elbMetricNamespace = 'AWS/ApplicationELB';
        const commonDimensions = {
            LoadBalancer: loadBalancerFullName,
        };

        const elb4xxAlarm = this.createAlarm(
            'Druid_UI_ELB_4xx_Events',
            this.createMetric(
                elbMetricNamespace,
                'HTTPCode_ELB_4XX_Count',
                5,
                'SUM',
                commonDimensions
            ),
            cw.ComparisonOperator.GREATER_THAN_THRESHOLD,
            50,
            3,
            5,
            cw.TreatMissingData.NOT_BREACHING
        );
        alarms.push(elb4xxAlarm);

        const elb5xxAlarm = this.createAlarm(
            'Druid_UI_ELB_5xx_Events',
            this.createMetric(
                elbMetricNamespace,
                'HTTPCode_ELB_5XX_Count',
                5,
                'SUM',
                commonDimensions
            ),
            cw.ComparisonOperator.GREATER_THAN_THRESHOLD,
            10,
            3,
            5,
            cw.TreatMissingData.NOT_BREACHING
        );
        alarms.push(elb5xxAlarm);

        const healthyHostAlarm = this.createAlarm(
            'Druid_UI_Healthy_Server',
            this.createMetric(elbMetricNamespace, 'HealthyHostCount', 5, 'AVERAGE', {
                ...commonDimensions,
                TargetGroup: targetGroupName,
            }),
            cw.ComparisonOperator.LESS_THAN_OR_EQUAL_TO_THRESHOLD,
            1,
            3,
            5,
            cw.TreatMissingData.MISSING
        );
        alarms.push(healthyHostAlarm);

        return alarms;
    }

    private createDruidAlarms(druidClusterName: string): cw.Alarm[] {
        const alarms: cw.Alarm[] = [];
        const commonDimensions = {
            'Druid.Cluster': druidClusterName,
        };

        // write code to create alarm for the following alarm
        const queryFailureAlarm = this.createAlarm(
            'Druid_Query_Failures',
            this.createMetric(
                DRUID_METRICS_NAMESPACE,
                'query/failed/count',
                5,
                'Average',
                {
                    ...commonDimensions,
                    'Druid.Service': 'druid/historical',
                }
            ),
            cw.ComparisonOperator.GREATER_THAN_THRESHOLD,
            5,
            3,
            5,
            cw.TreatMissingData.NOT_BREACHING
        );

        alarms.push(queryFailureAlarm);
        return alarms;
    }

    private createMetric(
        namespace: string,
        metricName: string,
        period: number,
        statistic: string,
        dimensionsMap: Record<string, string>
    ): cw.IMetric {
        return new cw.Metric({
            metricName,
            namespace,
            period: Duration.minutes(period),
            statistic: statistic,
            dimensionsMap,
        });
    }

    private createAlarm(
        alarmName: string,
        metric: cw.IMetric,
        comparisonOperator: cw.ComparisonOperator,
        threshold: number,
        datapointsToAlarm: number,
        evaluationPeriods: number,
        treatMissingData: cw.TreatMissingData
    ): cw.Alarm {
        return new cw.Alarm(this, alarmName, {
            metric,
            comparisonOperator,
            threshold,
            datapointsToAlarm,
            evaluationPeriods,
            treatMissingData,
        });
    }
}
