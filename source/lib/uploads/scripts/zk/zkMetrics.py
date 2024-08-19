# Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
# SPDX-License-Identifier: Apache-2.0
import boto3
import subprocess
from argparse import ArgumentParser

metric_unit_map = {
    'zk_avg_latency': 'Milliseconds',
    'zk_max_latency': 'Milliseconds',
    'zk_min_latency': 'Milliseconds',
    'zk_num_alive_connections': 'Count',
    'zk_outstanding_requests': 'Count',
    'zk_znode_count': 'Count',
    'zk_watch_count': 'Count',
    'zk_watch_bytes': 'Bytes',
    'zk_approximate_data_size': 'Bytes',
    'zk_packets_sent': 'Count',
    'zk_packets_received': 'Count',
    'zk_connection_drop_count': 'Count',
    'zk_server_state': 'None'
}

metric_namespace = 'AWSSolutions/Druid'


def parse_args():
    parser = ArgumentParser()
    parser.add_argument('--zookeeper-home', dest='zookeeper_home', type=str, required=True,
                        help='Druid home directory')
    parser.add_argument('--region', dest='region', type=str, required=True,
                        help='AWS region')
    parser.add_argument('--cluster-name', dest='cluster_name', type=str, required=True,
                        help='Cluster name')
    args = parser.parse_args()
    return args


def get_zk_id(zk_id_file):
    zk_id = None
    with open(zk_id_file, encoding='utf-8') as f:
        zk_id = f.read().strip()
    return zk_id


def get_metrics_from_zk():
    '''get metrics from zookeeper using zookeeper command'''
    result = subprocess.run(
        'echo mntr | nc localhost 2181',
        shell=True,
        text=True,
        stdout=subprocess.PIPE
    )
    metrics = {}
    for line in result.stdout.split('\n'):
        # skip empty lines
        if not line.strip():
            continue
        if 'zk_version' not in line:
            metric_data = [t.strip() for t in line.split()]
            if len(metric_data) >= 2:
                metric_name, metric_value = metric_data[:2]
                if metric_name in metric_unit_map:
                    metrics[metric_name] = metric_value

    return metrics


def main():
    args = parse_args()

    zk_id = get_zk_id(
        '{zookeeper_home}/data/zk/myid'.format(zookeeper_home=args.zookeeper_home))

    cloudwatch = boto3.client('cloudwatch', args.region)

    metrics = get_metrics_from_zk()

    for metric_name, metric_value in metrics.items():
        if metric_name == 'zk_server_state':
            print('Checking leader; current value: {}'.format(metric_value))
            if metric_value.strip() == 'leader':
                print('Current ZK is leader')
                cloudwatch.put_metric_data(
                    MetricData=[
                        {
                            'MetricName': 'zk_leader',
                            'Dimensions': [
                                {
                                    'Name': 'Druid.Service',
                                    'Value': 'ZooKeeper'
                                },
                                {
                                    'Name': 'Druid.Cluster',
                                    'Value': args.cluster_name
                                }
                            ],
                            'Unit': 'None',
                            'Value': 3
                        },
                    ],
                    Namespace=metric_namespace
                )
        else:
            print('publish metrics to cloudwatch: name {}, value {}'.format(
                metric_name, metric_value))
            cloudwatch.put_metric_data(
                MetricData=[
                    {
                        'MetricName': metric_name,
                        'Dimensions': [
                            {
                                'Name': 'Druid.Service',
                                'Value': 'ZooKeeper'
                            },
                            {
                                'Name': 'Druid.Cluster',
                                'Value': args.cluster_name
                            },
                            {
                                'Name': 'ZooKeeper.ID',
                                'Value': zk_id
                            }
                        ],
                        'Unit': metric_unit_map.get(metric_name, 'Count'),
                        'Value': float(metric_value)
                    },
                ],
                Namespace=metric_namespace
            )


if __name__ == '__main__':
    main()
