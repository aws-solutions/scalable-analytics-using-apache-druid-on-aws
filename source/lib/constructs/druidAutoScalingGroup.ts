/* 
 Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 SPDX-License-Identifier: Apache-2.0
*/
import * as as from 'aws-cdk-lib/aws-autoscaling';
import * as cdk from 'aws-cdk-lib';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import * as ssm from 'aws-cdk-lib/aws-ssm';
import * as utils from '../utils/utils';

import {
    CustomAmi,
    DruidClusterParameters,
    DruidNodeType,
    Ec2Config,
    Ec2InstanceConfig,
} from '../utils/types';
import {
    DEEP_STORAGE_PREFIX,
    DRUID_METRICS_NAMESPACE,
    INSTANCE_TERMINATION_TIMEOUT,
    ROLLING_UPDATE_PAUSE_TIME,
} from '../utils/constants';

import { BaseInfrastructure } from './baseInfrastructure';
import { Construct } from 'constructs';
import { IRole } from 'aws-cdk-lib/aws-iam';
import { MetadataStore } from './metadataStore';
import { SSMAutomation } from './ssmAutomation';
import { ZooKeeper } from './zookeeper';
import { readFileSync } from 'fs';

export interface DruidAutoScalingGroupProps {
    readonly asgContext: DruidAutoScalingGroupContext;
    readonly nodeType: DruidNodeType;
    readonly serviceTier?: string;
    readonly brokerTiers?: string[];
    readonly baseUrl: string;
}

// Shared context parameters across all auto scaling groups
export interface DruidAutoScalingGroupContext {
    readonly ec2IamRole: IRole;
    readonly clusterParams: DruidClusterParameters;
    readonly securityGroup: ec2.ISecurityGroup;
    readonly rdsMetadataConstruct: MetadataStore;
    readonly baseInfra: BaseInfrastructure;
    readonly zookeeper: ZooKeeper;
    readonly customAmi?: CustomAmi;
    readonly solutionVersion: string;
    readonly tlsCertificateSecretName: string;
}

//Creates Launch Template for EC2 and Autoscaling group for different druid process Types
export class DruidAutoScalingGroup extends Construct {
    // use AutoScalingGroup instead of IAutoScalingGroup here as scaleOnRequestCount only exists in AutoScalingGroup
    public readonly autoScalingGroup: as.AutoScalingGroup;
    public readonly gracefulTerminationParam: ssm.IStringParameter;

    public constructor(
        scope: Construct,
        name: string,
        props: DruidAutoScalingGroupProps
    ) {
        super(scope, name);
        const asgContext = props.asgContext;
        const ec2Config = asgContext.clusterParams.hostingConfig as Ec2Config;
        const nodeTierName = utils.getNodeTierName(props.nodeType, props.serviceTier);

        // The null check has been done by the caller (ie. druidEc2Stack) to ensure that the nodeType is present in the config
        // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
        const instanceConfig = ec2Config[nodeTierName]!;

        this.gracefulTerminationParam = new ssm.StringParameter(
            this,
            'graceful-termination-parameter',
            {
                description:
                    'A parameter to control the termination of druid nodes within the auto scaling group',
                stringValue: '__NOT_USED__',
            }
        );
        this.gracefulTerminationParam.grantRead(asgContext.ec2IamRole);
        this.gracefulTerminationParam.grantWrite(asgContext.ec2IamRole);

        //autoScalingGroupName prop is not used to making autoscaling group have the update functionality working while deploying the stack
        const asg = new as.AutoScalingGroup(this, name, {
            vpc: asgContext.baseInfra.vpc,
            minCapacity: instanceConfig.minNodes,
            maxCapacity: instanceConfig.maxNodes,
            launchTemplate: utils.createLaunchTemplate(
                this,
                `${props.nodeType}_launch_template`,
                props.asgContext.securityGroup,
                props.asgContext.ec2IamRole,
                instanceConfig,
                props.asgContext.customAmi
            ),
            updatePolicy: as.UpdatePolicy.rollingUpdate({
                maxBatchSize: instanceConfig.rollingUpdatePolicy?.maxBatchSize,
            }),
            signals: as.Signals.waitForAll({
                timeout: cdk.Duration.minutes(ROLLING_UPDATE_PAUSE_TIME),
            }),
            notifications: [
                {
                    topic: asgContext.baseInfra.snsTopic,
                },
            ],
        });
        asg.addUserData(this.createUserData(props, instanceConfig, asg).render());

        utils.addNameTag(asg, nodeTierName);
        if (props.serviceTier) {
            utils.addTierTag(asg, props.serviceTier);
        }

        this.createASGLifecycleHook(
            asgContext,
            asg,
            props.nodeType,
            nodeTierName,
            this.gracefulTerminationParam
        );

        this.autoScalingGroup = asg;
    }

    private createASGLifecycleHook(
        asgContext: DruidAutoScalingGroupContext,
        asg: as.IAutoScalingGroup,
        nodeType: DruidNodeType,
        nodeTierName: string,
        gracefulTerminationParam: ssm.IStringParameter
    ): void {
        // using prettier-ignore prevents prettier from reformatting the nosonar line to the next line
        // prettier-ignore
        new as.CfnLifecycleHook(this, 'lifecycle-termination', { // NOSONAR (typescript:S1848) - cdk construct is used
            autoScalingGroupName: asg.autoScalingGroupName,
            lifecycleTransition: as.LifecycleTransition.INSTANCE_TERMINATING,
            defaultResult: as.DefaultResult.CONTINUE,
            heartbeatTimeout: INSTANCE_TERMINATION_TIMEOUT,
        });

        // prettier-ignore
        new SSMAutomation(this, 'ssm-automation', { // NOSONAR (typescript:S1848) - cdk construct is used
            nodeType,
            serviceName: `${asgContext.clusterParams.druidClusterName}_${nodeTierName}`,
            secretArn:
                asgContext.rdsMetadataConstruct.druidInternalSystemUserSecret.secretArn,
            targetAutoScalingGroupArn: asg.autoScalingGroupArn,
            targetAutoScalingGroupName: asg.autoScalingGroupName,
            ec2IamRole: asgContext.ec2IamRole,
            installationBucket: asgContext.baseInfra.installationBucket,
            gracefulTerminationParamName: gracefulTerminationParam.parameterName,
        });
    }

    private createUserData(
        props: DruidAutoScalingGroupProps,
        instanceConfig: Ec2InstanceConfig,
        asg: as.AutoScalingGroup
    ): ec2.UserData {
        const userDataScriptsFolder = 'lib/config/user_data';
        const userDataFilePath = `${userDataScriptsFolder}/${props.nodeType}_user_data`;
        const commonUserData = readFileSync(
            `${userDataScriptsFolder}/common_user_data`,
            'utf-8'
        ).toString();
        const asgContext = props.asgContext;

        const ec2Config = props.asgContext.clusterParams.hostingConfig as Ec2Config;
        const historicalInstanceConfig = (ec2Config[DruidNodeType.DATA] ||
            ec2Config[DruidNodeType.HISTORICAL])!;
        const historicalInstanceTypeInfo = utils.getInstanceTypeInfo(
            historicalInstanceConfig.instanceType
        );

        const instanceTypeInfo = utils.getInstanceTypeInfo(
            ec2Config[props.nodeType]?.instanceType ?? ''
        );

        const templateVariables: Record<string, string> = {
            /* eslint-disable @typescript-eslint/naming-convention */
            COMMON_USER_DATA: commonUserData,
            TLS_CERTIFICATE_SECRET_NAME: props.asgContext.tlsCertificateSecretName,
            SOLUTION_VERSION: asgContext.solutionVersion,
            S3_INSTALLATION_BUCKET: asgContext.baseInfra.installationBucket.bucketName,
            S3_DATA_BUCKET: asgContext.baseInfra.deepStorageBucket.bucketName,
            S3_DATA_BUCKET_KEY_ID: utils.ifUndefined(
                asgContext.baseInfra.deepStorageEncryptionKey?.keyId,
                ''
            ),
            S3_DATA_BUCKET_PREFIX: utils.ifUndefined(
                asgContext.clusterParams.druidDeepStorageConfig?.bucketPrefix,
                DEEP_STORAGE_PREFIX
            ),
            DRUID_VERSION: asgContext.clusterParams.druidVersion,
            DRUID_EXTENSIONS: JSON.stringify(asgContext.clusterParams.druidExtensions),
            DRUID_COMPONENT: utils.getNodeTierName(props.nodeType, props.serviceTier),
            REGION: cdk.Aws.REGION,
            STACK_NAME: cdk.Aws.STACK_NAME,
            RESOURCE_NAME: (asg.node.defaultChild as as.CfnAutoScalingGroup).logicalId,
            ZOOKEEPER_IPS: asgContext.zookeeper.zookeeperConnectionString,
            RDS_ADDRESS_ENDPOINT: asgContext.rdsMetadataConstruct.dbEndpointAddress,
            RDS_PORT_ENDPOINT: String(asgContext.rdsMetadataConstruct.dbEndpointPort),
            RDS_SECRET_NAME:
                asgContext.rdsMetadataConstruct.dbMasterUserSecret.secretName,
            DB_NAME: asgContext.rdsMetadataConstruct.dbName,
            DRUID_METRICS_NAMESPACE: DRUID_METRICS_NAMESPACE,
            DRUID_CLUSTER_NAME: asgContext.clusterParams.druidClusterName,
            OIDC_CLIENT_ID: utils.ifUndefined(
                asgContext.clusterParams.oidcIdpConfig?.clientId,
                ''
            ),
            OIDC_DISCOVERY_URI: utils.ifUndefined(
                asgContext.clusterParams.oidcIdpConfig?.discoveryURI,
                ''
            ),
            OIDC_GROUP_CLAIM_NAME: utils.ifUndefined(
                asgContext.clusterParams.oidcIdpConfig?.groupClaimName,
                ''
            ),
            OIDC_CUSTOM_SCOPES: utils.ifUndefined(
                JSON.stringify(asgContext.clusterParams.oidcIdpConfig?.customScopes),
                ''
            ),
            DRUID_BASE_URL: props.baseUrl,
            GRACEFUL_TERMINATION_PARAM_NAME: this.gracefulTerminationParam.parameterName,
            ADMIN_USER_SECRET_NAME:
                asgContext.rdsMetadataConstruct.druidAdminUserSecret.secretName,
            SYSTEM_USER_SECRET_NAME:
                asgContext.rdsMetadataConstruct.druidInternalSystemUserSecret.secretName,
            OIDC_CLIENT_SECRET_NAME: utils.ifUndefined(
                asgContext.baseInfra.oidcIdpClientSecret?.secretName,
                ''
            ),
            USE_FIPS_ENDPOINT: asgContext.clusterParams.enableFipsEndpoints
                ? 'true'
                : 'false',
            SERVICE_TIER: utils.ifUndefined(props.serviceTier, '_default_tier'),
            SERVICE_PRIORITY: (instanceConfig.servicePriority ?? 0).toString(),
            BROKER_TIERS: JSON.stringify(utils.ifUndefined(props.brokerTiers, [])),
            NUM_HTTP_CONNECTIONS: (props.nodeType === DruidNodeType.QUERY
                ? Math.ceil(
                      asgContext.clusterParams.druidConcurrentQueryLimit /
                          instanceConfig.minNodes
                  )
                : asgContext.clusterParams.druidConcurrentQueryLimit
            ).toString(),
            NUM_MERGE_BUFFERS: Math.max(
                2,
                Math.ceil(historicalInstanceTypeInfo.cpu / 4)
            ).toString(),
            COMMON_CONFIG_VERSION: readFileSync(
                'lib/uploads/config/_common_version.txt'
            ).toString(),
            COMMON_RUNTIME_CONFIG: JSON.stringify(
                utils.ifUndefined(asgContext.clusterParams.druidCommonRuntimeConfig, '')
            ),
            QUERY_CONFIG_VERSION: readFileSync(
                'lib/uploads/config/query_version.txt'
            ).toString(),
            MASTER_CONFIG_VERSION: readFileSync(
                'lib/uploads/config/master_version.txt'
            ).toString(),
            COORDINATOR_RUNTIME_CONFIG: JSON.stringify({
                'druid.coordinator.loadqueuepeon.http.batchSize': Math.ceil(
                    historicalInstanceTypeInfo.cpu / 4
                ),
                ...instanceConfig.runtimeConfig?.coordinator,
            }),
            OVERLORD_RUNTIME_CONFIG: JSON.stringify(
                utils.ifUndefined(instanceConfig.runtimeConfig?.overlord, '')
            ),
            BROKER_RUNTIME_CONFIG: JSON.stringify(
                utils.ifUndefined(instanceConfig.runtimeConfig?.broker, '')
            ),
            ROUTER_RUNTIME_CONFIG: JSON.stringify(
                utils.ifUndefined(instanceConfig.runtimeConfig?.router, '')
            ),
            MIDDLEMANAGER_RUNTIME_CONFIG: JSON.stringify(
                utils.ifUndefined(instanceConfig.runtimeConfig?.middleManager, '')
            ),
            HISTORICAL_RUNTIME_CONFIG: JSON.stringify(
                utils.ifUndefined(instanceConfig.runtimeConfig?.historical, '')
            ),
            EMITTER_CONFIG: JSON.stringify(
                utils.ifUndefined(asgContext.clusterParams.druidEmitterConfig, '')
            ),
            HISTORICAL_CONFIG_VERSION: readFileSync(
                'lib/uploads/config/historical_version.txt'
            ).toString(),
            MIDDLEMANAGER_CONFIG_VERSION: readFileSync(
                'lib/uploads/config/middleManager_version.txt'
            ).toString(),
            CPU_ARCHITECTURE:
                instanceTypeInfo.arch.toString() === 'arm64' ? 'arm64' : 'amd64',
            /* eslint-enable @typescript-eslint/naming-convention */
        };

        let userDataStr = readFileSync(userDataFilePath, 'utf-8').toString();
        Object.entries(templateVariables).forEach(([key, value]) => {
            userDataStr = userDataStr.replace(new RegExp(`{{${key}}}`, 'g'), value);
        });
        return ec2.UserData.custom(userDataStr);
    }
}
