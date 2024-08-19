#!/bin/bash
# Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
# SPDX-License-Identifier: Apache-2.0
ZK_HOST=$1
ZK_PORT="2181"
MAX_ATTEMPTS=60

attempt=0
while [ $attempt -lt $MAX_ATTEMPTS ]; do
    response=$(echo ruok | nc "$ZK_HOST" "$ZK_PORT")

    if [ "$response" = "imok" ]; then
        echo "ZooKeeper is healthy"
        exit 0
    else
        echo "ZooKeeper is not healthy, retrying in 5 seconds..."
        sleep 5
    fi
    attempt=$((attempt + 1))
done

exit 1