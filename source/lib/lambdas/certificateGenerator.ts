/* 
  Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
  
  Licensed under the Apache License, Version 2.0 (the "License").
  You may not use this file except in compliance with the License.
  You may obtain a copy of the License at
  
      http://www.apache.org/licenses/LICENSE-2.0
  
  Unless required by applicable law or agreed to in writing, software
  distributed under the License is distributed on an "AS IS" BASIS,
  WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
  See the License for the specific language governing permissions and
  limitations under the License.
*/
import * as forge from 'node-forge';
import * as fs from 'fs';
import * as sm from '@aws-sdk/client-secrets-manager';

/* eslint-disable @typescript-eslint/naming-convention */
import {
    CloudFormationCustomResourceEvent,
    CloudFormationCustomResourceFailedResponse,
    CloudFormationCustomResourceSuccessResponse,
} from 'aws-lambda';

import { SDK_CLIENT_CONFIG } from '../utils/constants';

/* eslint-disable @typescript-eslint/no-explicit-any */
(forge as any).options.usePureJavaScript = true;

const secrets = new sm.SecretsManagerClient(SDK_CLIENT_CONFIG);

export async function onEventHandler(
    event: CloudFormationCustomResourceEvent
): Promise<
    | CloudFormationCustomResourceSuccessResponse
    | CloudFormationCustomResourceFailedResponse
> {
    console.info(`Processing event ${JSON.stringify(event)}`);

    if (event.RequestType === 'Create') {
        const certificate = generateCA();

        fs.writeFileSync('/tmp/output.p12', certificate, 'binary'); // NOSONAR (typescript:S5443:directories are used safely here)

        await secrets.send(
            new sm.UpdateSecretCommand({
                SecretId: event.ResourceProperties.TLSSecretId,
                SecretBinary: fs.readFileSync('/tmp/output.p12'), // NOSONAR (typescript:S5443:directories are used safely here)
            })
        );
    }

    return { ...event, Status: 'SUCCESS', PhysicalResourceId: '' };
}

function generateCA(): string {
    const keys = forge.pki.rsa.generateKeyPair(2048);

    const certificate = forge.pki.createCertificate();
    certificate.publicKey = keys.publicKey;
    certificate.validity.notBefore = new Date();
    certificate.validity.notAfter = new Date();

    certificate.validity.notAfter.setDate(
        certificate.validity.notBefore.getDate() + 3650
    );

    const attributes = [{ name: 'commonName', value: 'Druid Internal CA' }];
    certificate.setSubject(attributes);
    certificate.setIssuer(attributes);
    certificate.setExtensions([
        {
            name: 'basicConstraints',
            cA: true, // Set to true to indicate it's a CA certificate
        },
    ]);

    certificate.sign(keys.privateKey, forge.md.sha256.create());

    const p12 = forge.pkcs12.toPkcs12Asn1(keys.privateKey, certificate, 'changeit', {
        friendlyName: 'druid',
    });

    const der = forge.asn1.toDer(p12).getBytes();

    return der;
}
