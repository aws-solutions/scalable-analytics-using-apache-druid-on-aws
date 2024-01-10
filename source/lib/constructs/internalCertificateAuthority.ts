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
/* eslint-disable @typescript-eslint/naming-convention */

import * as cdk from 'aws-cdk-lib';
import * as cr from 'aws-cdk-lib/custom-resources';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as lambdaNodejs from 'aws-cdk-lib/aws-lambda-nodejs';
import * as kms from 'aws-cdk-lib/aws-kms';
import * as path from 'path';
import * as secretsmanager from 'aws-cdk-lib/aws-secretsmanager';

import { Construct } from 'constructs';

export class InternalCertificateAuthority extends Construct {
    public readonly TlsCertificate: secretsmanager.ISecret;

    public constructor(scope: Construct, id: string) {
        super(scope, id);

        this.TlsCertificate = new secretsmanager.Secret(this, 'tls-certificate', {
            description: 'TLS certificates for druid internal components',
            encryptionKey: new kms.Key(this, 'tls-certificate-encryption-key', {
                enableKeyRotation: true,
                removalPolicy: cdk.RemovalPolicy.DESTROY,
            }),
            removalPolicy: cdk.RemovalPolicy.DESTROY,
        });

        const handler = new lambdaNodejs.NodejsFunction(this, 'tls-generator-handler', {
            entry: path.join(__dirname, '../lambdas/certificateGenerator.ts'),
            handler: 'onEventHandler',
            runtime: lambda.Runtime.NODEJS_LATEST,
            timeout: cdk.Duration.minutes(15),
            description: 'Generates TLS certificates for Druid internal components',
        });

        this.TlsCertificate.grantWrite(handler);

        const provider = new cr.Provider(this, 'provider', { onEventHandler: handler });

        new cdk.CustomResource(this, 'tls-generator-custom-resource', {
            serviceToken: provider.serviceToken,
            properties: { TLSSecretId: this.TlsCertificate.secretArn },
        });
    }
}
