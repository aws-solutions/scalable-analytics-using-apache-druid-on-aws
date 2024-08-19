/* 
 Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 SPDX-License-Identifier: Apache-2.0
*/

import * as rds from 'aws-cdk-lib/aws-rds';

import { UserAgent } from '@aws-sdk/types';

/* eslint-disable @typescript-eslint/naming-convention */
export const DRUID_SECURITY_GROUP_NAME = 'DruidSecurityGroup';

export const SCRIPTS_FOLDER = 'scripts';

export const CONFIG_FOLDER = 'config';

export const EXTENSIONS_FOLDER = 'extensions';

export const DRUID_IMAGE_FOLDER = 'druid-images';

export const ZOOKEEPER_IMAGE_FOLDER = 'zookeeper-images';

//RDS DB Constants
export const RDS_DB_NAME = 'DruidMetadata';

export const RDS_DB_USERNAME = 'druid';

export const DRUID_ADMIN_USERNAME = 'admin';

export const DRUID_INTERNAL_SYSTEM_USERNAME = 'druid_system';

export const RDS_DB_STORAGE = 100;

export const RDS_BACKUP_RETENTION_DAYS = 14;

export const DRUID_METRICS_NAMESPACE = 'AWSSolutions/Druid';

export const DRUID_SEGMENT_VOLUME_SIZE = 300;

export const DRUID_TASK_VOLUME_SIZE = 100;

export const EKS_INITIAL_PROBE_DELAY = 30;

export const EKS_DEFAULT_REQUEST_CPU = '100m';

export const EKS_DEFAULT_REQUEST_MEMORY = '200Mi';

export const DEFAULT_ROOT_VOLUME_SIZE = 20;

export const S3_ACCESS_LOGS_PREFIX = 's3-access-logs';

export const VPC_FLOW_LOGS_PREFIX = 'vpc-flow-logs';

export const ALB_ACCESS_LOGS_PREFIX = 'alb-access-logs';

export const DEEP_STORAGE_PREFIX = 'druid/segments';

export const DEFAULT_TIER = '_default_tier';

export const ZOOKEEPER_DEFAULT_VERSION = '3.8.4';

export const DRUID_DEFAULT_VERSION = '30.0.0';

export const DEFAULT_POSTGRES_PORT = 5432;

export const DEFAULT_POSTGRES_VERSION = rds.AuroraPostgresEngineVersion.VER_14_9;

export const DEFAULT_NUM_HTTP_CONNECTIONS = 100;

export const INSTANCE_TERMINATION_TIMEOUT = 5400;

export const HOST_TERMINATION_DOC_SUFFIX = 'HostTerminationAutomationDoc';

export const ROLLING_UPDATE_PAUSE_TIME = 60;

export const CUSTOM_RESOURCE_MAX_ATTEMPTS = 5;

export const ROUTER_RUNTIME_PROPERTIES: Record<string, unknown> = {
    'druid.router.http.readTimeout': 'PT5M',
    'druid.router.managementProxy.enabled': true,
};

export const BROKER_RUNTIME_PROPERTIES: Record<string, unknown> = {
    'druid.sql.enable': true,
    'druid.broker.http.numConnections': 50,
    'druid.server.http.numThreads': 60,
    'druid.processing.buffer.sizeBytes': '500MiB',
};

export const COORDINATOR_RUNTIME_PROPERTIES: Record<string, unknown> = {
    'druid.coordinator.startDelay': 'PT10S',
    'druid.coordinator.period': 'PT5M',
    'druid.manager.config.pollDuration': 'PT5M',
    'druid.coordinator.balancer.strategy': 'random',
};

export const OVERLORD_RUNTIME_PROPERTIES: Record<string, unknown> = {
    'druid.indexer.queue.startDelay': 'PT5S',
    'druid.indexer.runner.type': 'remote',
    'druid.indexer.storage.type': 'metadata',
    'druid.indexer.storage.recentlyFinishedThreshold': 'PT2H',
    'druid.manager.config.pollDuration': 'PT10M',
    'druid.indexer.runner.maxZnodeBytes': 15728640,
    'druid.monitoring.monitors': [
        'org.apache.druid.server.metrics.TaskCountStatsMonitor',
    ],
};

export const MIDDLEMANAGER_RUNTIME_PROPERTIES: Record<string, unknown> = {
    'druid.indexer.fork.property.druid.processing.numMergeBuffers': 2,
    'druid.indexer.fork.property.druid.processing.buffer.sizeBytes': 100000000,
    'druid.indexer.fork.property.druid.processing.numThreads': 1,
    'druid.monitoring.monitors': [
        'org.apache.druid.server.metrics.WorkerTaskCountStatsMonitor',
    ],
};

export const HISTORICAL_RUNTIME_PROPERTIES: Record<string, unknown> = {
    'druid.processing.buffer.sizeBytes': '500MiB',
    'druid.historical.cache.useCache': true,
    'druid.historical.cache.populateCache': true,
    'druid.cache.type': 'caffeine',
    'druid.cache.sizeInBytes': '256MiB',
    'druid.monitoring.monitors': [
        'org.apache.druid.client.cache.CacheMonitor',
        'org.apache.druid.server.metrics.QueryCountStatsMonitor',
    ],
};

export const COMMON_RUNTIME_PROPERTIES: Record<string, unknown> = {
    'druid.lookup.enableLookupSyncOnStartup': false,
};

export const RUNTIME_PROPERTIES_PREFIX_FILTERS = [
    'druid.zk.service.host',
    'druid.zk.paths.base',
    'druid.zk.service.compress',
    'druid.metadata.storage',
    'druid.indexer.logs.type',
    'druid.indexer.logs.dir',
    'druid.emitter',
    'druid.selectors.indexing.serviceName',
    'druid.selectors.coordinator.serviceName',
    'druid.auth',
    'druid.escalator',
    'druid.service',
    'druid.segmentCache.locations',
    'druid.coordinator.asOverlord.enabled',
];

export const SDK_CLIENT_CONFIG = {
    customUserAgent: [[process.env.USER_AGENT_STRING]] as UserAgent,
};
