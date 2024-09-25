# Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
# SPDX-License-Identifier: Apache-2.0
from collections import OrderedDict
import os
import sys
import math
import subprocess
import json
import cpuinfo
from argparse import ArgumentParser
from jinja2 import Template
from render_utils import merge_properties_with_json, read_json_config


def parse_args():
    parser = ArgumentParser()
    parser.add_argument('--component', dest='component', type=str, required=True,
                        help='Druid component')
    parser.add_argument('--region', dest='region', type=str, required=True,
                        help='AWS region')
    parser.add_argument('--service-tier', dest='service_tier', type=str, required=False,
                        help='Service tier')
    parser.add_argument('--service-priority', dest='service_priority', type=int, required=False,
                        help='Service priority')
    parser.add_argument('--broker-tiers', dest='broker_tiers', type=str, required=False,
                        help='Broker tiers')
    parser.add_argument('--num-http-connections', dest='num_http_connections', type=int, required=False,
                        help='Number of HTTP connections')
    parser.add_argument('--num-merge-buffers', dest='num_merge_buffers', type=int, required=False,
                        help='Number of HTTP connections')
    args = parser.parse_args()
    return args


def get_memory_info():
    linux_filepath = "/proc/meminfo"
    memory_info = dict(
        (i.split()[0].rstrip(":"), int(i.split()[1]))
        for i in open(linux_filepath).readlines()
    )
    memory_info["memory_total_gb"] = memory_info["MemTotal"] / (2 ** 20)
    return memory_info


def get_segment_cache_list():
    segment_cache_list = []
    nvme_info = get_nvme_info()

    # If there are NVME devices, use them for segment cache
    if nvme_info.get('Devices') is not None:
        device_index = 2
        for nvme_device in nvme_info['Devices']:
            # ignore the EBS volume for root file system
            if nvme_device['DevicePath'] != '/dev/nvme0n1':
                segment_cache_list.append({
                    'path': '/mnt/disk{}/var/druid/druidSegments'.format(device_index),
                    'maxSize': nvme_device['PhysicalSize'],
                    'freeSpacePercent': 3.0
                })
                device_index += 1

    return segment_cache_list


def render_jvm_file(jvm_file, druid_component, **jvm_properties):
    json_data = read_json_config(
        f'{os.getenv("DRUID_HOME")}/runtime_config/{druid_component}.json')

    if json_data:
        additional_jvm_config = "\n".join([value for key, value in json_data.items(
        ) if key.startswith("jvm.config.")])
        jvm_properties['additional_jvm_config'] = additional_jvm_config

    with open(jvm_file) as tf:
        template = Template(tf.read(), autoescape=True)
        content = template.render(jvm_properties)
        with open(jvm_file, mode='w', encoding='utf-8') as outfile:
            outfile.write(content)


def get_nvme_info():
    nvme_output = subprocess.run(
        'nvme list -o json', capture_output=True, shell=True)
    return json.loads(nvme_output.stdout)


def render_runtime_properties(runtime_properties_file, druid_component, **runtime_properties):
    with open(runtime_properties_file) as tf:
        template = Template(tf.read(), autoescape=True)
        content = template.render(runtime_properties)
        with open(runtime_properties_file, mode='w', encoding='utf-8') as outfile:
            outfile.write(content)

    # Override the runtime.properties with the runtime configuration in cdk
    runtime_config_file = f'{os.getenv("DRUID_HOME")}/runtime_config/{druid_component}.json'
    merge_properties_with_json(runtime_properties_file, runtime_config_file)


def render_middle_manager_config(num_threads, region, service_tier=None, num_http_connections=None):
    druid_home = os.getenv('DRUID_HOME')
    jvm_file = None
    runtime_properties_file = None

    if service_tier is None or service_tier == '_default_tier':
        service_tier = '_default_worker_category'

    jvm_file = f'{druid_home}/conf/druid/cluster/data/middleManager/jvm.config'
    runtime_properties_file = f'{druid_home}/conf/druid/cluster/data/middleManager/runtime.properties'

    render_jvm_file(
        jvm_file, 'middleManager',
        jvm_heap_size_min='256m',
        jvm_heap_size_max='256m',
        region=region)

    # render runtime properties for middleManager
    render_runtime_properties(
        runtime_properties_file,
        'middleManager',
        num_threads=num_threads, region=region, service_tier=service_tier,
        num_http_connections=num_http_connections)


def render_historical_config(num_threads, region, cpu_info=None, service_tier=None, service_priority=None, num_http_connections=None):
    druid_home = os.getenv('DRUID_HOME')
    historical_cache_size = 1

    if service_tier is None:
        service_tier = '_default_tier'
    if service_priority is None:
        service_priority = 0

    jvm_file = f'{druid_home}/conf/druid/cluster/data/historical/jvm.config'
    runtime_properties_file = f'{druid_home}/conf/druid/cluster/data/historical/runtime.properties'

    # render runtime properties for historical
    num_segment_loading_threads = max(1, math.ceil(cpu_info['count'] / 4))
    num_merge_buffers = max(2, cpu_info['count'] // 4)

    # Historical heap is (0.5GiB * number of CPU cores), with an upper limit of ~24GiB to avoid gc lag
    historical_heap_size = min(24, math.floor(
        num_threads * 0.5 + historical_cache_size))
    # (druid.processing.numThreads + druid.processing.numMergeBuffers + 1) * druid.processing.buffer.sizeBytes
    direct_memory_size_max = (
        num_threads + num_merge_buffers + 1) * 500
    render_jvm_file(
        jvm_file, 'historical',
        jvm_heap_size_min=f'{historical_heap_size}g',
        jvm_heap_size_max=f'{historical_heap_size}g',
        region=region,
        direct_memory_size_max=f'{direct_memory_size_max}m')

    render_runtime_properties(
        runtime_properties_file,
        'historical',
        num_threads=num_threads,
        num_merge_buffers=num_merge_buffers,
        region=region,
        segment_cache_list=json.dumps(get_segment_cache_list()),
        num_segment_loading_threads=num_segment_loading_threads,
        cache_size=f'{historical_cache_size}GiB',
        service_tier=service_tier,
        service_priority=service_priority,
        num_http_connections=num_http_connections)


def render_jvm_config(component, region, service_tier=None, service_priority=None, broker_tiers=None, num_http_connections=None, num_merge_buffers=None):
    ''' Render JVM configuration 
        https://druid.apache.org/docs/latest/operations/basic-cluster-tuning.html
    '''
    druid_home = os.getenv('DRUID_HOME')
    cpu_info = cpuinfo.get_cpu_info()
    memory_info = get_memory_info()

    if component == 'master':
        # Set overlord heap to a value that's 25-50% of your Coordinator heap.
        overlord_heap_size = max(1, math.floor(
            memory_info['memory_total_gb'] * 0.25))
        coordinator_heap_size = max(1, math.floor(
            memory_info['memory_total_gb'] * 0.5))

        # Render overlord configuration
        render_jvm_file(
            f'{druid_home}/conf/druid/cluster/master/overlord/jvm.config', 'overlord',
            jvm_heap_size_min=f'{overlord_heap_size}g', jvm_heap_size_max=f'{overlord_heap_size}g', region=region)
        render_runtime_properties(
            f'{druid_home}/conf/druid/cluster/master/overlord/runtime.properties',
            'overlord')

        # Render coordinator configuration
        render_jvm_file(
            f'{druid_home}/conf/druid/cluster/master/coordinator/jvm.config', 'coordinator',
            jvm_heap_size_min=f'{coordinator_heap_size}g', jvm_heap_size_max=f'{coordinator_heap_size}g', region=region)
        render_runtime_properties(
            f'{druid_home}/conf/druid/cluster/master/coordinator/runtime.properties',
            'coordinator')

    elif component == 'query':
        broker_heap_size = max(1, math.floor(
            memory_info['memory_total_gb'] * 0.3))
        # Render broker configuration
        direct_memory_size_max = (num_merge_buffers + 1) * 500
        render_jvm_file(
            f'{druid_home}/conf/druid/cluster/query/broker/jvm.config', 'broker',
            jvm_heap_size_min=f'{broker_heap_size}g', jvm_heap_size_max=f'{broker_heap_size}g',
            direct_memory_size_max=f'{direct_memory_size_max}m', region=region)
        render_runtime_properties(
            f'{druid_home}/conf/druid/cluster/query/broker/runtime.properties',
            'broker',
            service_tier=service_tier,
            num_http_connections=num_http_connections,
            num_merge_buffers=num_merge_buffers)

        tier_to_broker_map = OrderedDict()
        if broker_tiers:
            for tier in broker_tiers[1:-1].split(','):
                if tier != '_default_tier':
                    tier_to_broker_map[tier] = f'druid/broker-{tier}'
                else:
                    tier_to_broker_map[tier] = 'druid/broker'

        # Render router configuration
        render_jvm_file(
            f'{druid_home}/conf/druid/cluster/query/router/jvm.config', 'router',
            jvm_heap_size_min='256m', jvm_heap_size_max='256m', region=region)
        render_runtime_properties(
            f'{druid_home}/conf/druid/cluster/query/router/runtime.properties',
            'router',
            tier_to_broker_map=json.dumps(tier_to_broker_map), num_http_connections=num_http_connections)

    elif component == 'data':
        # split CPU threads between historical and middleManager
        num_threads = max(1, cpu_info['count'] // 2)

        render_middle_manager_config(
            num_threads, region, service_tier=service_tier, num_http_connections=num_http_connections)
        render_historical_config(
            num_threads, region, cpu_info=cpu_info, service_tier=service_tier,
            service_priority=service_priority, num_http_connections=num_http_connections)

    elif component == 'historical':
        render_historical_config(
            cpu_info['count'] - 1, region, cpu_info=cpu_info,  service_tier=service_tier,
            service_priority=service_priority, num_http_connections=num_http_connections)

    elif component == 'middleManager':
        render_middle_manager_config(
            cpu_info['count'] - 1, region, service_tier=service_tier, num_http_connections=num_http_connections)


def main():
    if not os.getenv('DRUID_HOME'):
        print('Error: DRUID_HOME is not set in environment.')
        sys.exit(1)

    args = parse_args()
    render_jvm_config(component=args.component, region=args.region,
                      service_tier=args.service_tier, service_priority=args.service_priority,
                      broker_tiers=args.broker_tiers,
                      num_http_connections=args.num_http_connections,
                      num_merge_buffers=args.num_merge_buffers)


if __name__ == '__main__':
    main()
