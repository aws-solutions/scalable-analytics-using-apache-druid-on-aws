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