#!/bin/bash
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
NODE_TYPE=$1
SECRET_ID=$2
GRACEFUL_TERMINATION_PARAM_NAME=$3

if [ -z "$NODE_TYPE" ]; then
    echo "Node type not provided. Please provide the node type."
    exit 1
fi

if [ -z "$SECRET_ID" ]; then
    echo "Secret ID not provided. Please provide the secret ID"
    exit 1
fi

if [ -z "$GRACEFUL_TERMINATION_PARAM_NAME" ]; then
    echo "The graceful termination parameter name not provided. Please provide the parameter name."
    exit 1
fi

SECRET_VALUE=$(aws secretsmanager get-secret-value --secret-id "$SECRET_ID" --query 'SecretString' --output text 2>/dev/null)

if [ $? -ne 0 ]; then
    echo "Failed to retrieve the secret value for Secret ID: $SECRET_ID"
    exit 1
fi

USERNAME=$(echo "$SECRET_VALUE" | jq -r '.username')
PASSWORD=$(echo "$SECRET_VALUE" | jq -r '.password')
SUPERVISORCTL_CMD="/usr/local/bin/supervisorctl -c /home/druid-cluster/apache-druid/conf/supervisor/supervisord.conf"
MIDDLE_MANAGER_BASE_URL="https://localhost:8291/druid/worker/v1"

TOKEN=$(curl -X PUT "http://169.254.169.254/latest/api/token" -H "X-aws-ec2-metadata-token-ttl-seconds: 21600")
INSTANCE_ID=$(curl -H "X-aws-ec2-metadata-token: $TOKEN" -v http://169.254.169.254/latest/meta-data/instance-id)

aws ssm put-parameter --name "$GRACEFUL_TERMINATION_PARAM_NAME" --value "$INSTANCE_ID" --type String --overwrite
if [ $? -ne 0 ]; then
    echo "Failed to update the graceful termination param."
    exit 1
fi

waitForNoIngestionTasks() {
    waitAttempts=75
    
    for i in $(seq 1 $waitAttempts); do
        echo "Checking for active tasks - attempt $i..."

        tasks=$(curl -skL -u "$USERNAME:$PASSWORD" ${MIDDLE_MANAGER_BASE_URL}/tasks)
        if [[ "$tasks" == "[]" ]]; then
            echo "No more active tasks. MiddleManager can be deactivated."
            $SUPERVISORCTL_CMD stop middleManager
            exit 0
        elif [[ "$tasks" == "" ]]; then
            echo "Druid MiddleManager doesn't seem to be alive."
            exit 0
        else
            echo "Active tasks: $tasks"
            echo "Sleeping for 60 seconds..."
            sleep 60
        fi
    done

    echo "Couldn't stop tasks in $waitAttempts attempts. Returning error"
}

checkProcessStatus() {
    local process_name="$1"

    if $SUPERVISORCTL_CMD status | grep -q "${process_name}.*RUNNING"; then
        echo "RUNNING"
    else
        echo "STOPPED"
    fi
}

waitForProcess() {
    local process_name="$1"

    if [[ "$(checkProcessStatus ${process_name})" != "RUNNING" ]]; then
        return
    fi

    # maximum wait time for node to start is 1 hour
    for i in $(seq 1 720); do
        echo "Checking for new node status - attempt $i..."
        PARAMETER_VALUE=$(aws ssm get-parameter --name "$GRACEFUL_TERMINATION_PARAM_NAME" --query 'Parameter.Value' --output text 2>/dev/null)

        if [ "$PARAMETER_VALUE" = "$INSTANCE_ID" ]; then
            echo "Wait for new node to start..."
            sleep 5
        else
            echo "The new node is up. Stopping old node..."
            $SUPERVISORCTL_CMD stop $process_name
            break
        fi
    done
}

disableMiddleManager() {
    if [[ "$(checkProcessStatus middleManager)" != "RUNNING" ]]; then
        return
    fi

    for i in $(seq 1 10); do
        echo "Disabling MiddleManager - attempt $i..."
        disabled=$(curl -skL -u "$USERNAME:$PASSWORD" -X POST ${MIDDLE_MANAGER_BASE_URL}/disable)
        if [[ $disabled == *":\"disabled\"}" ]]; then
            echo "MiddleManager successfully disabled: $disabled"
            break
        elif [[ "$disabled" == "" ]]; then
            echo "Druid MiddleManager doesn't seem to be alive."
            break
        else
            echo "Was not able to disable MiddleManager. Response: $disabled"
            sleep 10
        fi
    done
}

case $NODE_TYPE in
    master)
        waitForProcess coordinator
        waitForProcess overlord
        ;;
    data)
        disableMiddleManager
        waitForProcess historical
        waitForNoIngestionTasks
        ;;
    query)
        waitForProcess broker
        waitForProcess router
        ;;
    historical)
        waitForProcess historical
        ;;
    middleManager)
        disableMiddleManager
        waitForNoIngestionTasks
        ;;
    *)
        echo "Invalid node type."
        ;;
esac

exit 0
