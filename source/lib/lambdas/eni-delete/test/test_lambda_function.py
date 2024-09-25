######################################################################################################################
#  Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.                                                #
#                                                                                                                    #
#  Licensed under the Apache License, Version 2.0 (the "License"). You may not use this file except in compliance    #
#  with the License. A copy of the License is located at                                                             #
#                                                                                                                    #
#      http://www.apache.org/licenses/LICENSE-2.0                                                                    #
#                                                                                                                    #
#  or in the 'license' file accompanying this file. This file is distributed on an 'AS IS' BASIS, WITHOUT WARRANTIES #
#  OR CONDITIONS OF ANY KIND, express or implied. See the License for the specific language governing permissions    #
#  and limitations under the License.                                                                                #
######################################################################################################################

import os
import unittest
from unittest import mock
import boto3, botocore
from moto import mock_ec2

@mock_ec2
class EniDeletionTest(unittest.TestCase):

    def mocked_cf_event(self):
        return {
            "ResourceProperties": {
                "securityGroups": [self.security_group.group_id],
            }
        }

    def mocked_cf_event_non_existent_enis(self):
        return {
            "ResourceProperties": {
                "securityGroups": ['sg-00000000000000000'],
            }
        }

    def setUp(self):
        self.resource = boto3.resource('ec2', region_name=os.environ.get("AWS_REGION"))
        self.client = boto3.client('ec2', region_name=os.environ.get("AWS_REGION"))

        self.vpc = self.resource.create_vpc(CidrBlock='10.0.0.0/16')
        self.subnet = self.resource.create_subnet(CidrBlock='10.0.0.0/24', VpcId=self.vpc.vpc_id)
        self.security_group = self.resource.create_security_group(
            GroupName='test-sgone',
            Description='test-sgone',
            VpcId=self.vpc.vpc_id)

        self.test_enis = []
        eni1 = self.resource.create_network_interface(
            PrivateIpAddress='10.0.0.1',
            Description='test-eneone',
            SubnetId=self.subnet.subnet_id
        )
        self.client.modify_network_interface_attribute(
            NetworkInterfaceId=eni1.network_interface_id,
            Groups=[self.security_group.group_id]
        )
        self.test_enis.append(eni1.network_interface_id)

        eni2 = self.resource.create_network_interface(
            PrivateIpAddress='10.0.0.2',
            Description='test-enetwo',
            SubnetId=self.subnet.subnet_id
        )
        self.client.modify_network_interface_attribute(
            NetworkInterfaceId=eni2.network_interface_id,
            Groups=[self.security_group.group_id]
        )
        self.test_enis.append(eni2.network_interface_id)

    def tearDown(self):
        for eni in self.test_enis:
            try:
                self.client.delete_network_interface(NetworkInterfaceId=eni)
            except botocore.exceptions.ClientError as err:
                if err.response['Error']['Code'] == 'InvalidNetworkInterfaceID.NotFound':
                    continue
        self.security_group.delete()
        self.subnet.delete()
        self.vpc.delete()

    def test_no_op(self):
        from lambda_function import no_op

        try:
            no_op(None, None)
        except:
            self.fail("no_op raised an exception")

    def test_delete_eni(self):
        from lambda_function import delete_eni

        enis = self.client.describe_network_interfaces(
            Filters=[
                {
                    'Name': 'group-id',
                    'Values': [
                        f'{self.security_group.group_id}',
                    ]
                },
            ],
        )
        self.assertEqual(len(list(enis['NetworkInterfaces'])), 2)
        delete_eni(self.mocked_cf_event(), None)
        enis = self.client.describe_network_interfaces(
            Filters=[
                {
                    'Name': 'group-id',
                    'Values': [
                        f'{self.security_group.group_id}',
                    ]
                },
            ],
        )
        self.assertEqual(len(list(enis['NetworkInterfaces'])), 0)

    def test_delete_non_existent_enis(self):
        from lambda_function import delete_eni

        try:
            delete_eni(self.mocked_cf_event_non_existent_enis(), None)
        except:
            self.fail("delete_eni raised an exception")

    def test_poll_delete_eni(self):
        from lambda_function import poll_delete_eni

        try:
            poll_delete_eni(self.mocked_cf_event(), None)
        except:
            self.fail("poll_delete_eni raised an exception")
        return_value = poll_delete_eni(self.mocked_cf_event(), None)
        self.assertEqual(return_value, True)
