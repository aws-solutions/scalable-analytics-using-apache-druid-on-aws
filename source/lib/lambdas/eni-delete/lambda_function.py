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
import sys

root = os.environ["LAMBDA_TASK_ROOT"] + "/py_modules"
sys.path.insert(0, root)
import boto3, logging, botocore
from crhelper import CfnResource

logger = logging.getLogger(__name__)
helper = CfnResource(json_logging=True, log_level='INFO')


def delete_eni_resources(event, _):
    '''
        This function will delete the ENI resources. It's invoked by
        crhelper during the CloudFormation Delete operation. This function is also
        invoked by crhelper as it tries to poll for the deletion of ENI resources.
    '''
    resource_properties = event["ResourceProperties"]
    security_groups = resource_properties["securityGroups"]
    ec2_client = boto3.client('ec2')
    errors = []
    for security_group in security_groups:
        # List all ENIs associated with the security group
        eni_response = ec2_client.describe_network_interfaces(
            Filters=[
                {
                    'Name': 'group-id',
                    'Values': [
                        f'{security_group}',
                    ]
                },
            ],
        )
        # Delete the ENIs
        for eni in eni_response['NetworkInterfaces']:
            try:
                ec2_client.delete_network_interface(NetworkInterfaceId=f'{eni["NetworkInterfaceId"]}')
            except botocore.exceptions.ClientError as e:
                # Poll again later if ENI is in use.
                if e.response['Error']['Code'] == 'InvalidNetworkInterface.InUse' or \
                    e.response['Error']['Code'] == 'InvalidParameterValue':
                    logger.info(f"[{e.response['Error']['Code']}] ENI {eni['NetworkInterfaceId']} is in use, will try again later")
                    return None
                errors.append(e)
        if errors:
            raise RuntimeError(f"Failed to delete ENI(s): {errors}")
        return True


@helper.create
@helper.update
def no_op(_, __):
    pass # No action is required when stack is created or updated


@helper.delete
def delete_eni(event, _):
    '''
        This function is invoked by crhelper as it deletes the ENI resources.
        See (https://github.com/aws-cloudformation/custom-resource-helper) for
        an explainer on why this function never returns anything
    '''
    delete_eni_resources(event, _)


@helper.poll_delete
def poll_delete_eni(event, _):
    '''
        This function is invoked by crhelper as it polls for the deletion of ENI resources
        See (https://github.com/aws-cloudformation/custom-resource-helper) for more info
        on why this function returns a value.
    '''
    return delete_eni_resources(event, _)


def handler(event, context):
    helper(event, context)
