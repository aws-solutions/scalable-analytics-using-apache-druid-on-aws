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
import json


def merge_properties_with_json(properties_file_path, json_file_path):
    # Load the properties file
    properties = {}
    with open(properties_file_path, 'r', encoding='utf-8') as properties_file:
        for line in properties_file:
            line = line.strip()
            if line and not line.startswith('#'):
                key, value = line.split('=', 1)
                properties[key.strip()] = value.strip()

    # Load the JSON file
    json_data = read_json_config(json_file_path)
    if not json_data:
        return

    # Merge the fields from JSON into properties
    filtered_dict = {key: value for key, value in json_data.items(
    ) if not key.startswith("jvm.config.")}
    for key, value in sorted(filtered_dict.items()):
        if isinstance(value, list) or isinstance(value, dict):
            properties[key] = json.dumps(value)
        elif isinstance(value, bool):
            properties[key] = str(value).lower()
        else:
            properties[key] = str(value)

    # Save the merged properties to a file
    with open(properties_file_path, 'w', encoding='utf-8') as output_file:
        for key, value in properties.items():
            output_file.write(f'{key}={value}\n')


def read_json_config(
    file_name,
    default_value=None
):
    try:
        with open(file_name, 'r', encoding='utf-8') as json_file:
            json_data = json.load(json_file)

            if isinstance(json_data, dict):
                return json_data
    except FileNotFoundError:
        print(f"File not found: {file_name}")
    except json.decoder.JSONDecodeError:
        print(f'{file_name} is empty or contains invalid JSON data.')

    return default_value