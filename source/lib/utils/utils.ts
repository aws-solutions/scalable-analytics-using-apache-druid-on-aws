/* 
 Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 SPDX-License-Identifier: Apache-2.0
*/
import * as cronParser from 'cron-parser';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import * as eks from 'aws-cdk-lib/aws-eks';
import * as fs from 'fs';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as cw from 'aws-cdk-lib/aws-cloudwatch';
import * as yaml from 'js-yaml';

import {
    CustomAmi,
    DruidNodeType,
    Ec2InstanceConfig,
    Ec2InstanceTypeInfo,
    DruidProcessType,
} from './types';
import {
    DEFAULT_ROOT_VOLUME_SIZE,
    DEFAULT_TIER,
    DRUID_METRICS_NAMESPACE,
} from './constants';

import { Construct } from 'constructs';
import { Duration, Tags } from 'aws-cdk-lib';

export function addNameTag(constructName: Construct, hostName: string): void {
    Tags.of(constructName).add('Name', hostName, {
        applyToLaunchedInstances: true,
        includeResourceTypes: ['AWS::AutoScaling::AutoScalingGroup'],
    });
}

export function addTierTag(constructName: Construct, tier: string): void {
    Tags.of(constructName).add('Tier', tier, {
        applyToLaunchedInstances: true,
        includeResourceTypes: ['AWS::AutoScaling::AutoScalingGroup'],
    });
}

export function loadClusterManifest(
    resourceId: string,
    manifest: string,
    cluster: eks.ICluster
): eks.KubernetesManifest[] {
    const manifestResources: eks.KubernetesManifest[] = [];
    yaml.loadAll(manifest).forEach((item, index) => {
        const resource = cluster.addManifest(
            `${resourceId}-${index}`,
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            item as Record<string, any>[]
        );
        manifestResources.push(resource);
    });
    return manifestResources;
}

export function generateServiceName(
    clusterName: string,
    nodeType: DruidNodeType,
    serviceTier?: string
): string {
    return clusterName
        ? `${clusterName}_${getNodeTierName(nodeType, serviceTier)}`
        : `${getNodeTierName(nodeType, serviceTier)}`;
}

export function getNodeTierName(nodeType: DruidNodeType, serviceTier?: string): string {
    return serviceTier && serviceTier !== DEFAULT_TIER
        ? `${nodeType}_${serviceTier}`
        : nodeType;
}

export function getInstanceTypeInfo(instanceType: string): Ec2InstanceTypeInfo {
    const instanceTypeInfo = JSON.parse(
        fs.readFileSync(`lib/instance-types/${instanceType}.json`, 'utf-8').toString()
    );

    return {
        cpu: instanceTypeInfo.InstanceTypes[0].VCpuInfo.DefaultVCpus,
        memory: instanceTypeInfo.InstanceTypes[0].MemoryInfo.SizeInMiB,
        arch: instanceTypeInfo.InstanceTypes[0].ProcessorInfo.SupportedArchitectures[0],
    };
}

export function createLaunchTemplate(
    scope: Construct,
    launchTemplateName: string,
    securityGroup: ec2.ISecurityGroup,
    ec2IamRole: iam.IRole,
    instanceConfig: Ec2InstanceConfig,
    customAmi?: CustomAmi
): ec2.LaunchTemplate {
    const blockDevices = [];
    blockDevices.push({
        // Use /dev/sda1 for Ubuntu based images and /dev/xvda for Amazon Linux based images
        // See https://docs.aws.amazon.com/AWSEC2/latest/UserGuide/device_naming.html for more details.
        deviceName: customAmi ? '/dev/sda1' : '/dev/xvda',
        volume: ec2.BlockDeviceVolume.ebs(
            instanceConfig.rootVolumeSize ?? DEFAULT_ROOT_VOLUME_SIZE,
            {
                encrypted: true,
            }
        ),
    });

    if (instanceConfig.segmentCacheVolumeSize) {
        blockDevices.push({
            deviceName: '/dev/sdf',
            volume: ec2.BlockDeviceVolume.ebs(instanceConfig.segmentCacheVolumeSize, {
                encrypted: true,
            }),
        });
    }

    const instanceTypeInfo = getInstanceTypeInfo(instanceConfig.instanceType);

    let machineImage: ec2.IMachineImage | undefined = undefined;

    if (customAmi) {
        machineImage =
            instanceTypeInfo.arch === ec2.AmazonLinuxCpuType.ARM_64
                ? new ec2.LookupMachineImage({ ...customAmi.arm64! })
                : new ec2.LookupMachineImage({ ...customAmi.amd64! });
    } else {
        machineImage = ec2.MachineImage.latestAmazonLinux2({
            cpuType: instanceTypeInfo.arch,
        });
    }

    return new ec2.LaunchTemplate(scope, launchTemplateName, {
        detailedMonitoring: true,
        instanceType: new ec2.InstanceType(instanceConfig.instanceType),
        machineImage,
        role: ec2IamRole,
        securityGroup,
        blockDevices,
        httpEndpoint: true,
        httpProtocolIpv6: true,
        httpPutResponseHopLimit: 1,
        httpTokens: ec2.LaunchTemplateHttpTokens.REQUIRED,
        instanceMetadataTags: true,
        requireImdsv2: true,
        userData: ec2.UserData.forLinux(),
    });
}

export function ifUndefined<T, R>(value: T | undefined, defaultValue: R): T | R {
    return value ?? defaultValue;
}

export function validateCronExpression(cronExpression: string): boolean {
    try {
        cronParser.parseExpression(cronExpression);
        return true;
    } catch (err) {
        return false;
    }
}

export function getDiskUsageMetric(autoScalingGroupName: string): cw.IMetric {
    return new cw.MathExpression({
        expression: '(usedDisk / totalDisk) * 100',
        usingMetrics: {
            totalDisk: new cw.Metric({
                namespace: DRUID_METRICS_NAMESPACE,
                metricName: 'disk_total',
                period: Duration.minutes(1),
                statistic: 'Sum',
                dimensionsMap: {
                    // eslint-disable-next-line @typescript-eslint/naming-convention
                    AutoScalingGroupName: autoScalingGroupName,
                },
            }),
            usedDisk: new cw.Metric({
                namespace: DRUID_METRICS_NAMESPACE,
                metricName: 'disk_used',
                statistic: 'Sum',
                period: Duration.minutes(1),
                dimensionsMap: {
                    // eslint-disable-next-line @typescript-eslint/naming-convention
                    AutoScalingGroupName: autoScalingGroupName,
                },
            }),
        },
        label: 'Disk Utilisation',
    });
}

export function getEc2ResourceMetric(
    autoScalingGroupName: string,
    metricName: 'CPUUtilization' | 'NetworkIn' | 'NetworkOut'
): cw.IMetric {
    return new cw.Metric({
        namespace: 'AWS/EC2',
        period: Duration.minutes(1),
        statistic: 'avg',
        dimensionsMap: {
            // eslint-disable-next-line @typescript-eslint/naming-convention
            AutoScalingGroupName: autoScalingGroupName,
        },
        metricName,
        label: metricName,
    });
}

export function getMemoryUsageMetric(autoScalingGroupName: string): cw.IMetric {
    return new cw.MathExpression({
        expression: '(usedMemory / totalMemory) * 100',
        usingMetrics: {
            totalMemory: new cw.Metric({
                namespace: DRUID_METRICS_NAMESPACE,
                metricName: 'mem_total',
                period: Duration.minutes(1),
                statistic: 'avg',
                dimensionsMap: {
                    // eslint-disable-next-line @typescript-eslint/naming-convention
                    AutoScalingGroupName: autoScalingGroupName,
                },
            }),
            usedMemory: new cw.Metric({
                namespace: DRUID_METRICS_NAMESPACE,
                metricName: 'mem_used',
                statistic: 'avg',
                period: Duration.minutes(1),
                dimensionsMap: {
                    // eslint-disable-next-line @typescript-eslint/naming-convention
                    AutoScalingGroupName: autoScalingGroupName,
                },
            }),
        },
        label: 'Memory Utilisation',
    });
}

export function mapProcessTypeToNodeType(processType: DruidProcessType): DruidNodeType {
    switch (processType) {
        case DruidProcessType.COORDINATOR:
            return DruidNodeType.MASTER;
        case DruidProcessType.OVERLORD:
            return DruidNodeType.MASTER;
        case DruidProcessType.HISTORICAL:
            return DruidNodeType.DATA;
        case DruidProcessType.MIDDLE_MANAGER:
            return DruidNodeType.DATA;
        case DruidProcessType.ROUTER:
            return DruidNodeType.QUERY;
        case DruidProcessType.BROKER:
            return DruidNodeType.QUERY;
        default:
            return DruidNodeType.ZOOKEEPER;
    }
}
