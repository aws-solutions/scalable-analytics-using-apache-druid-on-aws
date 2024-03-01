#
# Licensed to the Apache Software Foundation (ASF) under one
# or more contributor license agreements.  See the NOTICE file
# distributed with this work for additional information
# regarding copyright ownership.  The ASF licenses this file
# to you under the Apache License, Version 2.0 (the
# "License"); you may not use this file except in compliance
# with the License.  You may obtain a copy of the License at
#
#   http://www.apache.org/licenses/LICENSE-2.0
#
# Unless required by applicable law or agreed to in writing,
# software distributed under the License is distributed on an
# "AS IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY
# KIND, either express or implied.  See the License for the
# specific language governing permissions and limitations
# under the License.
#
import os
import sys
import json
import requests
from argparse import ArgumentParser
from jinja2 import Template
from render_utils import merge_properties_with_json, read_json_config


def get_host_name():
    token = requests.put('http://169.254.169.254/latest/api/token',
                         headers={'X-aws-ec2-metadata-token-ttl-seconds': '600'}).text
    r = requests.get('http://169.254.169.254/latest/meta-data/hostname',
                     headers={'X-aws-ec2-metadata-token': token})
    r.raise_for_status()
    return r.text


def parse_args():
    parser = ArgumentParser()
    parser.add_argument('--cluster-name', dest='cluster_name', type=str, required=True,
                        help='Cluster name')
    parser.add_argument('--data-bucket', dest='data_bucket', type=str, required=True,
                        help='Data bucket')
    parser.add_argument('--data-bucket-prefix', dest='data_bucket_prefix', type=str, required=True,
                        help='Data bucket prefix')
    parser.add_argument('--data-bucket-key-id', dest='data_bucket_key_id', type=str, required=False,
                        nargs='?', const='', default='', help='Data bucket kms key id')
    parser.add_argument('--database-name', dest='database_name', type=str, required=True,
                        help='Database name')
    parser.add_argument('--rds-endpoint', dest='rds_endpoint', type=str, required=True,
                        help='RDS endpoint'),
    parser.add_argument('--rds-port', dest='rds_port', type=str, required=True,
                        help='RDS port'),
    parser.add_argument('--rds-username', dest='rds_username', type=str, required=True,
                        help='RDS username'),
    parser.add_argument('--druid-extensions', dest='druid_extensions', type=str, required=True,
                        help='Druid extensions'),
    parser.add_argument('--oidc-client-id', dest='oidc_client_id', type=str, required=False,
                        nargs='?', const='', default='', help='OIDC client id'),
    parser.add_argument('--oidc-discovery-uri', dest='oidc_discovery_uri', type=str, required=False,
                        nargs='?', const='', default='', help='OIDC discovery URI'),
    parser.add_argument('--zookeeper-ips', dest='zookeeper_ips', type=str, required=True,
                        help='Zookeeper IPs'),
    parser.add_argument('--oidc-group-claim-name', dest='oidc_group_claim_name', type=str, required=False,
                        nargs='?', const='', default='', help='OIDC group claim name'),
    parser.add_argument('--oidc-custom-scopes', dest='oidc_custom_scopes', type=str, required=False,
                        nargs='?', const='', default='', help='OIDC custom scopes'),
    parser.add_argument('--druid-base-url', dest='druid_base_url', type=str, required=False,
                        nargs='?', const='', default='', help='Base url of the druid cluster'),
    parser.add_argument('--solution-version', dest='solution_version', type=str, required=False,
                        nargs='?', const='', default='', help='Solution version'),
    args = parser.parse_args()
    return args


def render_config(
        cluster_name,
        data_bucket,
        data_bucket_prefix,
        data_bucket_key_id,
        rds_endpoint,
        rds_port,
        rds_username,
        database_name,
        druid_extensions,
        zookeeper_ips,
        druid_base_url,
        oidc_client_id=None,
        oidc_discovery_uri=None,
        oidc_group_claim_name=None,
        oidc_custom_scopes=None,
        solution_version=None,
):

    host_name = get_host_name()
    emitter_config = read_json_config(
        f'{os.getenv("DRUID_HOME")}/runtime_config/emitter_config.json', {})

    common_runtime_properties_file = f'{os.getenv("DRUID_HOME")}/conf/druid/cluster/_common/common.runtime.properties'
    with open(common_runtime_properties_file) as tf:
        template = Template(tf.read(), autoescape=True)

        content = template.render({
            'cluster_name': cluster_name,
            'host_name': host_name,
            'zookeeper_ips': zookeeper_ips,
            'data_bucket': data_bucket,
            'data_bucket_prefix': data_bucket_prefix,
            'data_bucket_key_id': data_bucket_key_id,
            'rds_endpoint': rds_endpoint,
            'rds_port': rds_port,
            'rds_username': rds_username,
            'database_name': database_name,
            'druid_extensions': json.dumps([e for e in druid_extensions[1:-1].split(',')]),
            'oidc_client_id': oidc_client_id,
            'oidc_discovery_uri': oidc_discovery_uri,
            'oidc_group_claim_name': oidc_group_claim_name,
            'oidc_custom_scopes': oidc_custom_scopes,
            'emitter_config': emitter_config,
            'druid_base_url': druid_base_url,
            'solution_version': solution_version,
            'internal_client_username': os.getenv('DRUID_INTERNAL_CLIENT_USERNAME'),
        })

        with open(common_runtime_properties_file, mode='w', encoding='utf-8') as outfile:
            outfile.write(content)

    # Override the common.runtime.properties with the common runtime configuration in cdk
    merge_properties_with_json(common_runtime_properties_file,
                               f'{os.getenv("DRUID_HOME")}/runtime_config/common_runtime_config.json')


def main():
    if not os.getenv('DRUID_HOME'):
        print('Error: DRUID_HOME is not set in environment.')
        sys.exit(1)

    args = parse_args()
    render_config(
        cluster_name=args.cluster_name,
        data_bucket=args.data_bucket,
        data_bucket_prefix=args.data_bucket_prefix,
        data_bucket_key_id=args.data_bucket_key_id,
        rds_endpoint=args.rds_endpoint,
        rds_port=args.rds_port,
        rds_username=args.rds_username,
        database_name=args.database_name,
        druid_extensions=args.druid_extensions,
        zookeeper_ips=args.zookeeper_ips,
        druid_base_url=args.druid_base_url,
        oidc_client_id=args.oidc_client_id,
        oidc_discovery_uri=args.oidc_discovery_uri,
        oidc_group_claim_name=args.oidc_group_claim_name,
        oidc_custom_scopes=args.oidc_custom_scopes,
        solution_version=args.solution_version)


if __name__ == '__main__':
    main()
