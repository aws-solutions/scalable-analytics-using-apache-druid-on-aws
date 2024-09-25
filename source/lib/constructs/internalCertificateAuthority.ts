/* 
 Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 SPDX-License-Identifier: Apache-2.0
*/
/* eslint-disable @typescript-eslint/naming-convention */

import * as cdk from 'aws-cdk-lib';
import * as cr from 'aws-cdk-lib/custom-resources';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import * as kms from 'aws-cdk-lib/aws-kms';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as lambdaNodejs from 'aws-cdk-lib/aws-lambda-nodejs';
import * as path from 'path';
import * as secretsmanager from 'aws-cdk-lib/aws-secretsmanager';

import { Construct } from 'constructs';

export interface InternalCertificateAuthorityProps {
    vpc: ec2.IVpc;
}

export class InternalCertificateAuthority extends Construct {
    public readonly TlsCertificate: secretsmanager.ISecret;

    public constructor(
        scope: Construct,
        id: string,
        props: InternalCertificateAuthorityProps
    ) {
        super(scope, id);

        this.TlsCertificate = new secretsmanager.Secret(this, 'tls-certificate', {
            description: 'TLS certificates for druid internal components',
            encryptionKey: new kms.Key(this, 'tls-certificate-encryption-key', {
                enableKeyRotation: true,
                removalPolicy: cdk.RemovalPolicy.RETAIN_ON_UPDATE_OR_DELETE,
            }),
            removalPolicy: cdk.RemovalPolicy.RETAIN_ON_UPDATE_OR_DELETE,
        });

        const handler = new lambdaNodejs.NodejsFunction(this, 'tls-generator-handler', {
            vpc: props.vpc,
            vpcSubnets: {
                subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS,
            },
            entry: path.join(__dirname, '../lambdas/certificateGenerator.ts'),
            handler: 'onEventHandler',
            runtime: lambda.Runtime.NODEJS_LATEST,
            timeout: cdk.Duration.minutes(15),
            description: 'Generates TLS certificates for Druid internal components',
        });

        this.TlsCertificate.grantWrite(handler);

        const provider = new cr.Provider(this, 'provider', {
            onEventHandler: handler,
        });

        // using prettier-ignore prevents prettier from reformatting the nosonar line to the next line
        // prettier-ignore
        new cdk.CustomResource(this, 'tls-generator-custom-resource', { // NOSONAR (typescript:S1848) - cdk construct is used
            serviceToken: provider.serviceToken,
            properties: { TLSSecretId: this.TlsCertificate.secretArn },
        });
    }
}
