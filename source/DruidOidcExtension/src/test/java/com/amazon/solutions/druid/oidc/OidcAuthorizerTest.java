
/*
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */
package com.amazon.solutions.druid.oidc;

import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

import java.util.ArrayList;
import java.util.HashMap;
import java.util.Map;
import java.util.regex.Pattern;

import org.apache.druid.server.security.Access;
import org.apache.druid.server.security.Action;
import org.apache.druid.server.security.AuthenticationResult;
import org.apache.druid.server.security.Resource;
import org.apache.druid.server.security.ResourceAction;
import org.junit.Before;
import org.junit.Test;

import net.minidev.json.JSONArray;

public class OidcAuthorizerTest {
    private OidcConfig oidcConfig;
    private OidcAuthorizer oidcAuthorizer;
    private Resource resource;
    private Map<String, Object> context;
    private AuthenticationResult result;
    private RoleProvider roleProvider;

    @Before
    public void setUp() {
        oidcConfig = mock(OidcConfig.class);
        result = mock(AuthenticationResult.class);
        roleProvider = mock(RoleProvider.class);

        context = new HashMap<>();
        when(result.getContext()).thenReturn(context);
        when(oidcConfig.getGroupClaimName()).thenReturn("groups");
        resource = new Resource("resourceName", "resourceType");

        oidcAuthorizer = new OidcAuthorizer(oidcConfig, roleProvider);
    }

    @Test
    public void deny_if_authentication_result_is_null() {
        // act
        Access access = oidcAuthorizer.authorize(null, resource, Action.READ);

        // assert
        assertFalse(access.isAllowed());
    }

    @Test
    public void deny_if_authentication_context_is_null() {
        // arrange
        when(result.getContext()).thenReturn(null);

        // act
        Access access = oidcAuthorizer.authorize(result, resource, Action.READ);

        // assert
        assertFalse(access.isAllowed());
    }

    @Test
    public void allow_if_group_authentication_is_not_configured(){
        // arrange
        when(oidcConfig.getGroupClaimName()).thenReturn(null);

        // act
        Access access = oidcAuthorizer.authorize(result, resource, Action.READ);

        // assert
        assertTrue(access.isAllowed());
    }

    @Test
    public void deny_if_authentication_context_has_no_group_claim() {
        // arrange
        context = new HashMap<>();

        // act
        Access access = oidcAuthorizer.authorize(result, resource, Action.READ);

        // assert
        assertFalse(access.isAllowed());
    }

    @Test
    public void deny_if_authenticated_user_has_no_permission() {
        // arrange
        JSONArray groupValues = new JSONArray();
        groupValues.add("unknown-group");
        context.put("groups", groupValues);
        ArrayList<Permission> permissions = new ArrayList<>();
        permissions.add(
                new Permission(new ResourceAction(new Resource("resourceName", "resourceType"), Action.WRITE),
                        Pattern.compile("resourceName")));

        when(roleProvider.getPermissions(any())).thenReturn(permissions);

        // act
        Access access = oidcAuthorizer.authorize(result, resource, Action.READ);

        // assert
        assertFalse(access.isAllowed());
    }

    @Test
    public void can_process_group_claim_value_as_comma_delimited_string() {
        // arrange
        String groupValues = "unknown-group, my-own-group";
        context.put("groups", groupValues);
        ArrayList<Permission> permissions = new ArrayList<>();
        permissions.add(
                new Permission(new ResourceAction(new Resource("resourceName", "resourceType"), Action.READ),
                        Pattern.compile("resourceName")));

        when(roleProvider.getPermissions(any())).thenReturn(permissions);

        // act
        Access access = oidcAuthorizer.authorize(result, resource, Action.READ);

        // assert
        assertTrue(access.isAllowed());
    }

    @Test
    public void allow_if_authenticated_user_has_permission() {
        // arrange
        JSONArray groupValues = new JSONArray();
        groupValues.add("unknown-group");
        context.put("groups", groupValues);
        ArrayList<Permission> permissions = new ArrayList<>();
        permissions.add(
                new Permission(new ResourceAction(new Resource("resourceName", "resourceType"), Action.READ),
                        Pattern.compile("resourceName")));

        when(roleProvider.getPermissions(any())).thenReturn(permissions);

        // act
        Access access = oidcAuthorizer.authorize(result, resource, Action.READ);

        // assert
        assertTrue(access.isAllowed());
    }
}