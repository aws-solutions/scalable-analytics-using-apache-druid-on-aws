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
import * as cdk from 'aws-cdk-lib';
import * as constructs from 'constructs';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import * as utils from '../utils/utils';

import { SubnetMapping } from '../utils/types';

/**
 * Wraps aroud a real VPC
 */
export class DruidVpc extends constructs.Construct implements ec2.IVpc {
    private readonly innerVpc: ec2.IVpc;
    public readonly vpcId: string;
    public readonly vpcArn: string;
    public readonly vpcCidrBlock: string;
    public readonly publicSubnets: ec2.ISubnet[];
    public readonly privateSubnets: ec2.ISubnet[];
    public readonly isolatedSubnets: ec2.ISubnet[];
    public readonly availabilityZones: string[];
    public readonly vpnGatewayId?: string;
    public readonly internetConnectivityEstablished: constructs.IDependable;
    public readonly stack: cdk.Stack;
    public readonly env: cdk.ResourceEnvironment;

    public constructor(
        scope: constructs.IConstruct,
        id: string,
        private readonly props: ec2.VpcProps & {
            subnetMappings?: SubnetMapping;
            vpcId?: string;
        }
    ) {
        super(scope, id);

        const stack = cdk.Stack.of(this);
        const maxAZs = utils.ifUndefined(props.maxAzs, 3);

        this.innerVpc = props.vpcId
            ? ec2.Vpc.fromLookup(this, 'inner-vpc', { vpcId: props.vpcId })
            : new ec2.Vpc(this, 'inner-vpc', props);

        this.vpcId =
            props.vpcId ?? (this.innerVpc.node.defaultChild as cdk.CfnResource).ref;
        this.vpcArn = cdk.Arn.format(
            {
                service: 'ec2',
                resource: 'vpc',
                resourceName: this.vpcId,
            },
            stack
        );
        this.vpcCidrBlock = utils.ifUndefined(
            props.ipAddresses?.allocateVpcCidr().cidrBlock,
            '10.0.0.0/16'
        );
        this.publicSubnets = props.subnetMappings
            ? props.subnetMappings.ingress.map((x) =>
                  ec2.Subnet.fromSubnetId(this, `${x}-i`, x)
              )
            : this.innerVpc.publicSubnets;

        this.privateSubnets = props.subnetMappings
            ? props.subnetMappings.service.map((x) =>
                  ec2.Subnet.fromSubnetId(this, `${x}-s`, x)
              )
            : this.innerVpc.privateSubnets;
        this.isolatedSubnets = props.subnetMappings
            ? props.subnetMappings.database.map((x) =>
                  ec2.Subnet.fromSubnetId(this, `${x}-d`, x)
              )
            : this.innerVpc.isolatedSubnets;
        this.availabilityZones = stack.availabilityZones.slice(0, maxAZs);
        this.vpnGatewayId = this.innerVpc.vpnGatewayId;
        this.stack = stack;
        this.internetConnectivityEstablished = new constructs.DependencyGroup();

        if (!props.vpcId) {
            // this is a brand new vpc, let's create the vpc endpoints
            this.addGatewayEndpoint('s3-vpc-gateway-endpoint', {
                service: ec2.GatewayVpcEndpointAwsService.S3,
            });

            this.addInterfaceEndpoint('secrets-manager-vpc-endpoint', {
                service: ec2.InterfaceVpcEndpointAwsService.SECRETS_MANAGER,
            });

            this.addInterfaceEndpoint('cloudwatch-vpc-endpoint', {
                service: ec2.InterfaceVpcEndpointAwsService.CLOUDWATCH,
            });

            this.addInterfaceEndpoint('logs-vpc-endpoint', {
                service: ec2.InterfaceVpcEndpointAwsService.CLOUDWATCH_LOGS,
            });

            this.addInterfaceEndpoint('kms-vpc-endpoint', {
                service: ec2.InterfaceVpcEndpointAwsService.KMS,
            });

            this.addInterfaceEndpoint('cfn-vpc-endpoint', {
                service: ec2.InterfaceVpcEndpointAwsService.CLOUDFORMATION,
            });
        }
    }

    public selectSubnets(
        selection?: ec2.SubnetSelection | undefined
    ): ec2.SelectedSubnets {
        if (!this.props.subnetMappings) {
            // no subnet mappings provided, let the inner vpc select subnets
            return this.innerVpc.selectSubnets(selection);
        }

        try {
            // vpc mappings provided, let inner vpc select by other criteria first, druid vpc only selects on subnet type
            const result = this.innerVpc.selectSubnets(selection);

            if (selection?.subnetType === undefined) {
                return result;
            }
        } catch (_e) {
            // inner vpc subnet selection failed, maybe we're selecting a subnet type that doesn't exist, leave it to druid vpc to perform selection
        }

        let output: ec2.ISubnet[] = [];

        // perform subnet selection using the provided mapping and ignore inner vpc selection result
        const subnetType = selection?.subnetType;

        switch (subnetType) {
            case ec2.SubnetType.PUBLIC:
                output = this.publicSubnets;
                break;
            case ec2.SubnetType.PRIVATE_WITH_EGRESS:
                output = this.privateSubnets;
                break;
            case ec2.SubnetType.PRIVATE_ISOLATED:
                output = this.isolatedSubnets;
                break;
        }

        return {
            subnetIds: output.map((x) => x.subnetId),
            availabilityZones: this.innerVpc.availabilityZones,
            hasPublic: output.some((x) =>
                this.publicSubnets.map((t) => t.subnetId).includes(x.subnetId)
            ),
            subnets: output,
            internetConnectivityEstablished: tap(new CompositeDependable(), (d) => {
                output.forEach((s) => {
                    d.add(s.internetConnectivityEstablished);
                });
            }),
        };
    }

    public enableVpnGateway(options: ec2.EnableVpnGatewayOptions): void {
        this.innerVpc.enableVpnGateway(options);
    }

    public addVpnConnection(
        id: string,
        options: ec2.VpnConnectionOptions
    ): ec2.VpnConnection {
        return this.innerVpc.addVpnConnection(id, options);
    }

    public addClientVpnEndpoint(
        id: string,
        options: ec2.ClientVpnEndpointOptions
    ): ec2.ClientVpnEndpoint {
        return this.innerVpc.addClientVpnEndpoint(id, options);
    }

    public addGatewayEndpoint(
        id: string,
        options: ec2.GatewayVpcEndpointOptions
    ): ec2.GatewayVpcEndpoint {
        return this.innerVpc.addGatewayEndpoint(id, options);
    }

    public addInterfaceEndpoint(
        id: string,
        options: ec2.InterfaceVpcEndpointOptions
    ): ec2.InterfaceVpcEndpoint {
        return this.innerVpc.addInterfaceEndpoint(id, options);
    }

    public addFlowLog(id: string, options?: ec2.FlowLogOptions | undefined): ec2.FlowLog {
        return this.innerVpc.addFlowLog(id, options);
    }

    public applyRemovalPolicy(policy: cdk.RemovalPolicy): void {
        this.innerVpc.applyRemovalPolicy(policy);
    }
}

class CompositeDependable implements constructs.IDependable {
    private readonly dependables = new Array<constructs.IDependable>();

    public constructor() {
        // eslint-disable-next-line @typescript-eslint/no-this-alias
        const self = this;
        constructs.Dependable.implement(this, {
            get dependencyRoots() {
                const ret = new Array<constructs.IConstruct>();
                for (const dep of self.dependables) {
                    ret.push(...constructs.Dependable.of(dep).dependencyRoots);
                }
                return ret;
            },
        });
    }

    /**
     * Add a construct to the dependency roots
     */
    public add(dep: constructs.IDependable): void {
        this.dependables.push(dep);
    }
}

function tap<T>(x: T, fn: (x: T) => void): T {
    fn(x);
    return x;
}
