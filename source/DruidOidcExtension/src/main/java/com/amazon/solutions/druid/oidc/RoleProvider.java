/*
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */
package com.amazon.solutions.druid.oidc;

import java.util.ArrayList;

import com.fasterxml.jackson.annotation.JsonTypeInfo;

@JsonTypeInfo(use = JsonTypeInfo.Id.NAME, property = "type", defaultImpl = BasicAuthenticationRoleProvider.class)
public interface RoleProvider {
    ArrayList<Permission> getPermissions(ArrayList<String> groups);
}
