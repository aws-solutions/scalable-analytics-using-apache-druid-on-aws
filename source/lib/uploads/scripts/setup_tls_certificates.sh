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

# Check for the correct number of arguments
if [ "$#" -ne 3 ]; then
    echo "Usage: $0 TLS_CERT_HOME TLS_CERTIFICATE_SECRET_NAME TLS_KEYSTORE_PASSWORD"
    exit 1
fi

TOKEN=$(curl -s -X PUT "http://169.254.169.254/latest/api/token" -H "X-aws-ec2-metadata-token-ttl-seconds: 21600")
HOSTNAME=$(curl -s -H "X-aws-ec2-metadata-token: $TOKEN" http://169.254.169.254/latest/meta-data/hostname)

TLS_CERT_HOME="$1"
TLS_CERTIFICATE_SECRET_NAME="$2"
TLS_KEYSTORE_PASSWORD="$3"

# Create TLS certificates directory
mkdir -p "$TLS_CERT_HOME"
cd $TLS_CERT_HOME

# Download CA from secrets manager
aws secretsmanager get-secret-value --secret-id "$TLS_CERTIFICATE_SECRET_NAME" --output text --query SecretBinary | base64 --decode > ca.p12

# Convert the CA to pem
openssl pkcs12 -in ca.p12 -out ca.pem -nodes -passin pass:changeit

# Generate the CSR
openssl genpkey -algorithm RSA -out druid.key -pkeyopt rsa_keygen_bits:2048
openssl req -new -sha256 -key druid.key -out druid.csr -subj "/CN=$HOSTNAME"

# Sign the CSR using the CA
openssl x509 -req -in druid.csr -CA ca.pem -CAkey ca.pem -CAcreateserial -out druid.pem -days 365

# Convert the TLS cert to PKCS12 bundle
openssl pkcs12 -inkey druid.key -in druid.pem -export -out druid.p12 -name druid -passout pass:$TLS_KEYSTORE_PASSWORD

# Import the DER/P12 certificate along with the private key to keystore
keytool -importkeystore -destkeystore keystore.jks -srckeystore druid.p12 -srcstoretype PKCS12 -deststorepass $TLS_KEYSTORE_PASSWORD -srcstorepass $TLS_KEYSTORE_PASSWORD -noprompt

# Import the PEM encoded certificate to truststore
keytool -importcert -file ca.pem -alias druid -keystore truststore.jks -deststorepass $TLS_KEYSTORE_PASSWORD -noprompt

# Clean up
rm -rf druid.*
rm -rf ca.*

cd -
