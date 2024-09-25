/* 
 Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 SPDX-License-Identifier: Apache-2.0
*/
/* eslint-disable @typescript-eslint/naming-convention */

import * as acm from 'aws-cdk-lib/aws-certificatemanager';
import * as cdk from 'aws-cdk-lib';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import * as ecrassets from 'aws-cdk-lib/aws-ecr-assets';
import * as eks from 'aws-cdk-lib/aws-eks';
import * as elb from 'aws-cdk-lib/aws-elasticloadbalancingv2';
import * as fs from 'fs';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as metadataStoreUtils from '../utils/metadataStoreUtils';
import * as path from 'path';
import * as utils from '../utils/utils';

import {
    COMMON_RUNTIME_PROPERTIES,
    DEEP_STORAGE_PREFIX,
    EKS_INITIAL_PROBE_DELAY,
    RUNTIME_PROPERTIES_PREFIX_FILTERS,
} from '../utils/constants';
import { CustomAmi, DruidClusterParameters, EksConfig } from '../utils/types';

import { Asset } from 'aws-cdk-lib/aws-s3-assets';
import { BaseInfrastructure } from './baseInfrastructure';
import { Construct } from 'constructs';
import { KubectlV29Layer } from '@aws-cdk/lambda-layer-kubectl-v29';
import { MetadataStore } from './metadataStore';

export interface DruidEksBaseProps {
    baseInfra: BaseInfrastructure;
    customAmi?: CustomAmi;
    eksClusterConfig: EksConfig;
    druidClusterParams: DruidClusterParameters;
    acmCertificate?: acm.ICertificate;
    route53Params?: { route53HostedZoneId: string };
    druidDomain?: string;
    enableFipsEndpoints: boolean;
    removalPolicy: cdk.RemovalPolicy;
    webAclArn?: string;
    solutionVersion: string;
    solutionTags: Record<string, string>;
}

export abstract class DruidEksBase extends Construct {
    public readonly eksCluster: eks.ICluster;
    public readonly metadataDb: MetadataStore;

    public constructor(
        scope: Construct,
        id: string,
        protected readonly props: DruidEksBaseProps
    ) {
        super(scope, id);

        // create eks cluster
        this.eksCluster = this.createEksCluster();

        // create service account for the druid cluster (router, middlemanager etc...)
        const druidServiceAccount = this.createDruidServiceAccount();

        // install kubernetes external dns addons
        if (props.route53Params) {
            this.installExternalDnsAddon(props.route53Params.route53HostedZoneId);
        }

        this.metadataDb = metadataStoreUtils.createMetadataStore(
            this,
            props.druidClusterParams,
            props.baseInfra,
            this.eksCluster.clusterSecurityGroup,
            props.removalPolicy
        );

        this.metadataDb.dbMasterUserSecret.grantRead(druidServiceAccount.role);

        // create zookeeper
        this.createZookeeper();

        // create druid secrets
        this.createDruidSecrets(this.metadataDb);

        // create the actual druid cluster
        this.createDruidCluster(this.metadataDb);
    }

    public abstract createEksCluster(): eks.ICluster;

    public abstract deployZookeeperHelmChart(helmChartProps: {
        cluster: cdk.aws_eks.ICluster;
        repository: string;
        chart: string;
        release: string;
    }): eks.HelmChart;

    public abstract deployDruid(
        druidOperatorChart: eks.HelmChart,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        commonTemplateVariables: any
    ): void;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    protected getCommonEksClusterParams(): any {
        return {
            vpc: this.props.baseInfra.vpc,
            version: eks.KubernetesVersion.V1_29,
            kubectlLayer: new KubectlV29Layer(this, 'KubectlLayer'),
            albController: { version: eks.AlbControllerVersion.V2_6_2 },
            vpcSubnets: [{ subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS }],
            outputClusterName: true,
            endpointAccess: this.getEndpointAccessType(
                this.props.eksClusterConfig.endpointAccess
            ),
            clusterLogging: [
                eks.ClusterLoggingTypes.API,
                eks.ClusterLoggingTypes.AUDIT,
                eks.ClusterLoggingTypes.AUTHENTICATOR,
                eks.ClusterLoggingTypes.CONTROLLER_MANAGER,
                eks.ClusterLoggingTypes.SCHEDULER,
            ],
            mastersRole: new iam.Role(this, 'eks-cluster-master-role', {
                assumedBy: new iam.ArnPrincipal(
                    this.props.eksClusterConfig.clusterMasterPrincipalArn
                ),
            }),
        };
    }

    protected createDruidSecrets(metadataDb: MetadataStore): void {
        // refer to https://aws.amazon.com/blogs/containers/leverage-aws-secrets-stores-from-eks-fargate-with-external-secrets-operator/
        const addOnName = 'external-secrets';

        const externalSecretsChart = this.eksCluster.addHelmChart(`${addOnName}-chart`, {
            repository: 'https://charts.external-secrets.io',
            chart: addOnName,
            release: addOnName,
            namespace: addOnName,
            values: {
                webhook: {
                    create: false,
                },
                certController: {
                    create: false,
                },
            },
        });

        const serviceAccount = this.eksCluster.addServiceAccount(`${addOnName}-sa`, {
            name: `${addOnName}-sa`,
        });
        metadataDb.dbMasterUserSecret.grantRead(serviceAccount.role);
        metadataDb.druidAdminUserSecret.grantRead(serviceAccount.role);
        metadataDb.druidInternalSystemUserSecret.grantRead(serviceAccount.role);
        this.props.baseInfra.oidcIdpClientSecret?.grantRead(serviceAccount.role);

        // provision secrets store with provider SecretsManager
        const secretStoreName = 'aws-secrets';
        const secretStoreManifest = this.eksCluster.addManifest(
            `${addOnName}-store-driver`,
            {
                apiVersion: 'external-secrets.io/v1beta1',
                kind: 'SecretStore',
                metadata: {
                    name: secretStoreName,
                },
                spec: {
                    provider: {
                        aws: {
                            service: 'SecretsManager',
                            region: cdk.Stack.of(this).region,
                            auth: {
                                jwt: {
                                    serviceAccountRef: {
                                        name: serviceAccount.serviceAccountName,
                                    },
                                },
                            },
                        },
                    },
                },
            }
        );
        secretStoreManifest.node.addDependency(externalSecretsChart);

        const rdsSecretManifest = this.eksCluster.addManifest('druid-rds-secret', {
            apiVersion: 'external-secrets.io/v1beta1',
            kind: 'ExternalSecret',
            metadata: {
                name: 'druid-secret',
            },
            spec: {
                refreshInterval: '1h',
                secretStoreRef: {
                    name: secretStoreName,
                    kind: 'SecretStore',
                },
                target: {
                    name: 'druid-secret',
                    creationPolicy: 'Owner',
                },
                data: [
                    {
                        secretKey: 'rds-username',
                        remoteRef: {
                            key: metadataDb.dbMasterUserSecret.secretName,
                            property: 'username',
                        },
                    },
                    {
                        secretKey: 'rds-password',
                        remoteRef: {
                            key: metadataDb.dbMasterUserSecret.secretName,
                            property: 'password',
                        },
                    },
                    {
                        secretKey: 'druid-admin-password',
                        remoteRef: {
                            key: metadataDb.druidAdminUserSecret.secretName,
                            property: 'password',
                        },
                    },
                    {
                        secretKey: 'druid-internal-client-password',
                        remoteRef: {
                            key: metadataDb.druidInternalSystemUserSecret.secretName,
                            property: 'password',
                        },
                    },
                    ...(this.props.baseInfra.oidcIdpClientSecret
                        ? [
                              {
                                  secretKey: 'oidc-client-secret',
                                  remoteRef: {
                                      key: this.props.baseInfra.oidcIdpClientSecret
                                          .secretName,
                                      property: 'clientSecret',
                                  },
                              },
                              {
                                  secretKey: 'cookie-pass-phrase',
                                  remoteRef: {
                                      key: this.props.baseInfra.oidcIdpClientSecret
                                          .secretName,
                                      property: 'cookiePassphrase',
                                  },
                              },
                          ]
                        : []),
                ],
            },
        });
        rdsSecretManifest.node.addDependency(externalSecretsChart);
    }

    private getEndpointAccessType(endpointAccess?: string): eks.EndpointAccess {
        switch (endpointAccess) {
            case 'PUBLIC':
                return eks.EndpointAccess.PUBLIC;
            case 'PRIVATE':
                return eks.EndpointAccess.PRIVATE;
            case 'PUBLIC_AND_PRIVATE':
                return eks.EndpointAccess.PUBLIC_AND_PRIVATE;
            default:
                return eks.EndpointAccess.PRIVATE;
        }
    }

    private createDruidServiceAccount(): eks.ServiceAccount {
        const serviceAccount = this.eksCluster.addServiceAccount('druid-application-sa', {
            name: 'druid-application-sa',
        });

        serviceAccount.role.addToPrincipalPolicy(
            new iam.PolicyStatement({
                effect: iam.Effect.ALLOW,
                actions: [
                    's3:Put*',
                    's3:Get*',
                    's3:HeadObject',
                    's3:List*',
                    's3:DeleteObject',
                ],
                resources: [
                    this.props.baseInfra.deepStorageBucket.bucketArn,
                    `${this.props.baseInfra.deepStorageBucket.bucketArn}/*`,
                ],
            })
        );

        if (this.props.baseInfra.deepStorageEncryptionKey) {
            serviceAccount.role.addToPrincipalPolicy(
                new iam.PolicyStatement({
                    effect: iam.Effect.ALLOW,
                    actions: [
                        'kms:Encrypt*',
                        'kms:Decrypt*',
                        'kms:ReEncrypt*',
                        'kms:GenerateDataKey*',
                        'kms:Describe*',
                    ],
                    resources: [this.props.baseInfra.deepStorageEncryptionKey.keyArn],
                })
            );
        }

        serviceAccount.role.addToPrincipalPolicy(
            new iam.PolicyStatement({
                effect: iam.Effect.ALLOW,
                actions: ['cloudwatch:PutMetricData'],
                resources: ['*'],
            })
        );

        this.props.druidClusterParams.druidInstanceIamPolicyArns?.forEach(
            (druidInstanceIamPolicyArn, index) => {
                serviceAccount.role.addManagedPolicy(
                    iam.ManagedPolicy.fromManagedPolicyArn(
                        this,
                        `druid-instance-custom-policy-${index}`,
                        druidInstanceIamPolicyArn
                    )
                );
            }
        );

        return serviceAccount;
    }

    private installExternalDnsAddon(route53HostedZoneId: string): void {
        // refer to https://github.com/kubernetes-sigs/external-dns/blob/master/docs/tutorials/aws.md
        const serviceAccount = this.eksCluster.addServiceAccount('external-dns', {
            name: 'external-dns',
        });
        serviceAccount.addToPrincipalPolicy(
            new iam.PolicyStatement({
                actions: ['route53:ChangeResourceRecordSets'],
                resources: [`arn:aws:route53:::hostedzone/${route53HostedZoneId}`],
            })
        );
        serviceAccount.addToPrincipalPolicy(
            new iam.PolicyStatement({
                actions: ['route53:ListHostedZones', 'route53:ListResourceRecordSets'],
                resources: ['*'],
            })
        );
        const manifest = fs
            .readFileSync(
                path.resolve(__dirname, '../k8s-manifests/externaldns-with-rbac.yaml'),
                'utf8'
            )
            .replace(/{{aws_region}}/g, cdk.Stack.of(this).region);
        utils.loadClusterManifest('external-dns-manifest', manifest, this.eksCluster);
    }

    private createZookeeper(): eks.HelmChart {
        const helmChartProps = {
            cluster: this.eksCluster,
            repository: 'https://charts.bitnami.com/bitnami',
            chart: 'zookeeper',
            release: 'zookeeper',
        };

        return this.deployZookeeperHelmChart(helmChartProps);
    }

    private createDruidCluster(metadataDb: MetadataStore): void {
        const druidImageAsset = new ecrassets.DockerImageAsset(this, 'druid-aws-image', {
            directory: path.join(__dirname, '..', 'docker'),
            buildArgs: {
                imageTag: this.props.druidClusterParams.druidVersion,
            },
            platform: ecrassets.Platform.LINUX_AMD64,
        });

        const chartAsset = new Asset(this, 'druid-operator-chart-asset', {
            path: path.join(__dirname, '../druid-operator-chart'),
        });

        const druidOperatorChart = new eks.HelmChart(this, 'druid-operator-chart', {
            cluster: this.eksCluster,
            chartAsset,
            release: 'druid-operator',
            values: {
                replicaCount: 3,
                env: {
                    // eslint-disable-next-line @typescript-eslint/naming-convention
                    DENY_LIST: 'kube-system',
                },
            },
        });

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const commonTemplateVariables: Record<string, any> = {
            /* eslint-disable @typescript-eslint/naming-convention */
            solution_version: this.props.solutionVersion,
            cluster_name: this.props.druidClusterParams.druidClusterName,
            druid_image_uri: druidImageAsset.imageUri,
            druid_extensions: JSON.stringify(
                this.props.druidClusterParams.druidExtensions
            ),
            data_bucket: this.props.baseInfra.deepStorageBucket.bucketName,
            data_bucket_key_id: this.props.baseInfra.deepStorageEncryptionKey?.keyId,
            data_bucket_prefix: utils.ifUndefined(
                this.props.druidClusterParams.druidDeepStorageConfig?.bucketPrefix,
                DEEP_STORAGE_PREFIX
            ),
            rds_endpoint: metadataDb.dbEndpointAddress,
            rds_port: metadataDb.dbEndpointPort,
            rds_database_name: metadataDb.dbName,
            initial_probe_delay_seconds: EKS_INITIAL_PROBE_DELAY,
            oidc_client_id: this.props.druidClusterParams.oidcIdpConfig?.clientId,
            oidc_discovery_uri: this.props.druidClusterParams.oidcIdpConfig?.discoveryURI,
            oidc_group_claim_name:
                this.props.druidClusterParams.oidcIdpConfig?.groupClaimName,
            oidc_custom_scopes: this.props.druidClusterParams.oidcIdpConfig?.customScopes,
            alb_scheme: this.props.druidClusterParams.internetFacing
                ? 'internet-facing'
                : 'internal',
            alb_ssl_policy: this.props.druidClusterParams.enableFipsEndpoints
                ? elb.SslPolicy.TLS12
                : elb.SslPolicy.RECOMMENDED_TLS,
            alb_tags: Object.entries({
                ...this.props.solutionTags,
                ...(this.props.druidClusterParams.enableFipsEndpoints && {
                    'alb-fips-enabled': '',
                }),
            })
                .map(([key, value]) => `${key}=${value}`)
                .join(','),
            use_fips_endpoint: this.props.enableFipsEndpoints,
            common_runtime_properties: this.mergeRuntimeProperties(
                COMMON_RUNTIME_PROPERTIES,
                this.props.druidClusterParams.druidCommonRuntimeConfig
            ),
            /* eslint-enable */
        };

        if (this.props.webAclArn) {
            commonTemplateVariables.waf_annotation = `alb.ingress.kubernetes.io/wafv2-acl-arn: ${this.props.webAclArn}`;
        }

        if (this.props.acmCertificate) {
            commonTemplateVariables.certificate_arn =
                this.props.acmCertificate.certificateArn;
        }

        if (this.props.route53Params) {
            commonTemplateVariables.external_domain = this.props.druidDomain;
        }

        this.deployDruid(druidOperatorChart, commonTemplateVariables);
    }

    protected mergeRuntimeProperties(
        runtimeProperties: Record<string, unknown>,
        overrides: Record<string, unknown> | undefined
    ): { key: string; value: unknown }[] {
        const mergedRuntimeProperties = {
            ...runtimeProperties,
            ...overrides,
        };
        return Object.entries(mergedRuntimeProperties)
            .filter(
                ([key]) =>
                    !RUNTIME_PROPERTIES_PREFIX_FILTERS.some((prefix) =>
                        key.startsWith(prefix)
                    )
            )
            .map(([key, value]) => ({
                key,
                value:
                    typeof value === 'object' || Array.isArray(value)
                        ? JSON.stringify(value)
                        : value,
            }));
    }
}
