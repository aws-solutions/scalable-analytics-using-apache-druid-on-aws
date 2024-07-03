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
import time
import sys
import os
import subprocess
import requests
import argparse
import tenacity
import logging
from datetime import datetime
from requests.packages.urllib3.exceptions import InsecureRequestWarning


logger = logging.getLogger(__name__)
logging.basicConfig(format='%(asctime)s - %(message)s', level=logging.INFO)

# disable insecure ssl request warnings for self-signed certs
requests.packages.urllib3.disable_warnings(InsecureRequestWarning)

# common request parameters
requests_common_params = {
    'verify': False,
    'auth': (os.getenv('DRUID_INTERNAL_CLIENT_USERNAME'), os.getenv('DRUID_INTERNAL_CLIENT_PASSWORD'))
}


@tenacity.retry(stop=tenacity.stop_after_attempt(90),
                wait=tenacity.wait_fixed(10),
                retry=tenacity.retry_if_result(lambda x: x is False),
                retry_error_callback=lambda retry_state: retry_state.outcome.result())
def check_druid_health(process_name):
    try:
        response = requests.get(
            f"https://localhost:{druid_port_map[process_name]}/status/selfDiscovered",
            **requests_common_params)

        if response.status_code == 200:
            return True
        else:
            logger.info(
                f"Waiting for Druid to become healthy. Status code: {response.status_code}")
    except requests.RequestException:
        logger.info(f"Waiting for Druid to become healthy.")

    return False


def watchdog(retry_state):
    start_time = datetime.fromtimestamp(int(os.getenv('SYSTEM_START_TIME')))
    current_time = datetime.now()

    logger.debug('Retrying %s: attempt %s ended with: %s',
                 retry_state.fn, retry_state.attempt_number, retry_state.outcome)

    elapsed_time_seconds = (
        current_time - start_time).total_seconds()

    # the cfn singal wait timer is 1 hour, reserve 5 minutes to safe guard the signal
    # is sent before the signal timer expires. The total time to wait is 55 minutes.
    if elapsed_time_seconds >= 55 * 60:
        return True
    else:
        return False


@tenacity.retry(stop=watchdog,
                wait=tenacity.wait_fixed(10),
                retry=tenacity.retry_if_result(lambda x: x is False),
                retry_error_callback=lambda retry_state: retry_state.outcome.result())
def wait_for_segments(druid_base_url, tier='_default_tier'):
    try:
        response = requests.get(
            f"{druid_base_url}/druid/coordinator/v1/loadstatus?full&computeUsingClusterView",
            **requests_common_params)

        if response.ok:
            load_status = response.json()
            pending_segment_cnt = sum(load_status.get(tier, {}).values())

            if pending_segment_cnt == 0:
                logger.info("All segments have been downloaded.")
                return True
            else:
                logger.info(
                    f"There are {pending_segment_cnt} pending segments.")
        else:
            logger.error(
                f"Failed to retrieve load status. Status code: {response.status_code}")
    except requests.RequestException as e:
        logger.error(
            f"Failed to retrieve load status. {e}")

    return False


def is_coordinator_leader_alive(druid_base_url):
    try:
        response = requests.get(
            f"{druid_base_url}/druid/coordinator/v1/leader",
            **requests_common_params)

        if response.ok:
            return True
        else:
            logger.info(
                f"Coordinator is not ready. Status code: {response.status_code}")
    except requests.RequestException:
        logger.error(f"Failed to retrieve coordinator status.")

    return False


@tenacity.retry(stop=tenacity.stop_after_attempt(30),
                wait=tenacity.wait_fixed(10),
                retry=tenacity.retry_if_result(lambda x: x is False),
                retry_error_callback=lambda retry_state: retry_state.outcome.result())
def check_process_status(process_name):
    process_output = subprocess.getoutput(
        f"ps -ef | grep 'org.apache.druid.cli.Main server {process_name}' | grep -v grep").strip()
    if process_output:
        logger.info(f"The process {process_name} is running.")
        return True

    return False


def reset_instance_termination_param(graceful_termination_param_name):
    try:
        subprocess.check_output(
            f"aws ssm put-parameter --name {graceful_termination_param_name} --value '__NOT_USED__' --type 'String' --overwrite", shell=True)
        logger.info("Reset instance termination param successfully.")
    except subprocess.CalledProcessError as e:
        logger.error("Error executing AWS CLI command:", e)


def parse_args():
    parser = argparse.ArgumentParser()
    parser.add_argument('--base-url', dest='druid_base_url', type=str, required=True,
                        help='Druid base url')
    parser.add_argument('--component-name', dest='druid_component_name', type=str, required=True,
                        help='Druid component name')
    parser.add_argument('--graceful-termination-param-name', dest='graceful_termination_param_name', type=str, required=True,
                        help='Graceful termination param name')
    parser.add_argument('--service-tier', dest='service_tier', type=str, required=False,
                        help='Service tier')
    args = parser.parse_args()
    return args


druid_component_map = {
    'master': ['coordinator', 'overlord'],
    'query': ['broker', 'router'],
    'data': ['historical', 'middleManager'],
    'historical': ['historical'],
    'middleManager': ['middleManager'],
}


druid_port_map = {
    'coordinator': 8281,
    'overlord': 8290,
    'broker': 8282,
    'router': 8888,
    'historical': 8283,
    'middleManager': 8291,
}


def main():
    args = parse_args()
    logger.info(
        f"Checking Druid {args.druid_component_name} health...")

    # Due to druid component starting sequence data -> query -> master, master comes up at last.
    # All the Druid nodes require to talk to master before serving any request. In this
    # case, we use the coordinator status to determine whether it is a new deployment or
    # existing deployment. If it is a new deployment, we can only check the process status.
    # If it is an existing deployment, we check whether the node is discovered or not.
    if is_coordinator_leader_alive(args.druid_base_url):
        health_statuses = [check_druid_health(
            process_name) for process_name in druid_component_map[args.druid_component_name]]
        if all(health_statuses):
            logger.info(
                f"Druid {args.druid_component_name} is healthy.")
            if args.druid_component_name == 'historical' or args.druid_component_name == 'data':
                # Wait for the coordinator to calculate segment availability.
                time.sleep(60)
                wait_for_segments(args.druid_base_url, args.service_tier)
            reset_instance_termination_param(
                args.graceful_termination_param_name)
            sys.exit(0)
        else:
            logger.info(
                f"Druid {args.druid_component_name} is not healthy.")
            sys.exit(1)
    else:
        logger.info("Coordinator leader is not alive.")
        process_statuses = [check_process_status(
            process_name) for process_name in druid_component_map[args.druid_component_name]]
        if all(process_statuses):
            logger.info(
                f"Druid {args.druid_component_name} is running.")
            reset_instance_termination_param(
                args.graceful_termination_param_name)
            sys.exit(0)
        else:
            logger.info(
                f"Druid {args.druid_component_name} failed to start.")
            sys.exit(1)


if __name__ == "__main__":
    main()