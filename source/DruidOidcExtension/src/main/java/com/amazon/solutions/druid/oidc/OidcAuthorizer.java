/*
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

package com.amazon.solutions.druid.oidc;

import java.util.ArrayList;
import java.util.Arrays;
import java.util.Map;
import java.util.Objects;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

import org.apache.druid.java.util.common.logger.Logger;
import org.apache.druid.server.security.Access;
import org.apache.druid.server.security.Action;
import org.apache.druid.server.security.AuthenticationResult;
import org.apache.druid.server.security.Authorizer;
import org.apache.druid.server.security.Resource;

import com.fasterxml.jackson.annotation.JacksonInject;
import com.fasterxml.jackson.annotation.JsonCreator;
import com.fasterxml.jackson.annotation.JsonTypeName;

import net.minidev.json.JSONArray;

@JsonTypeName("oidc")
public class OidcAuthorizer implements Authorizer {
    private static final Logger logger = new Logger(OidcAuthorizer.class);
    private OidcConfig oidcConfig;
    private RoleProvider roleProvider;

    @JsonCreator
    public OidcAuthorizer(@JacksonInject OidcConfig oidcConfig, @JacksonInject RoleProvider roleProvider) {
        logger.debug("Initialising oidc authoriser");
        this.oidcConfig = oidcConfig;
        this.roleProvider = roleProvider;
    }

    @Override
    public Access authorize(AuthenticationResult authenticationResult, Resource resource, Action action) {

        if (authenticationResult == null) {
            logger.debug("AuthenticationResult is null, deying access to resource");
            return deny();
        }

        Map<String, Object> authenticationContext = authenticationResult.getContext();

        if (authenticationContext == null) {
            logger.debug("AuthenticationContext is null, deying access to resource");

            return deny();
        }

        if (oidcConfig.getGroupClaimName() != null) {
            Object groupClaim = authenticationContext.get(oidcConfig.getGroupClaimName());

            if (groupClaim == null) {
                logger.debug("Authentication context has no group claims, denying access");
                return deny();
            }

            String[] groups = new String[0];

            try {
                groups = ((JSONArray) groupClaim).toArray(new String[0]);
            } catch (ClassCastException | ArrayStoreException exception) {
                // group claim isn't an array, treat it as comma limited string
                logger.debug(
                        "Unable to parse groupClaim %s, received CastException or ArrayException, treating it as comma limited string",
                        groupClaim);
                groups = groupClaim.toString().split((","));

                // trim
                for (int i = 0; i < groups.length; i++) {
                    groups[i] = groups[i].trim();
                }
            }

            logger.debug("Authentication context has groups %s", groups);

            ArrayList<Permission> permissions = roleProvider
                    .getPermissions(new ArrayList<>(Arrays.asList(groups)));

            logger.debug("Got permissions from basic security api [%s]", permissions);

            for (Permission permission : permissions) {
                if (permissionCheck(resource, action, permission)) {
                    return allow();
                }
            }

            return deny();

        }

        // no group claim name provided in config, always allow
        return allow();
    }

    private Access allow() {
        return new Access(true);
    }

    private Access deny() {
        return new Access(false);
    }

    private boolean permissionCheck(Resource resource, Action action, Permission permission) {
        if (action != permission.getResourceAction().getAction()) {
            return false;
        }

        Resource permissionResource = permission.getResourceAction().getResource();
        if (!Objects.equals(permissionResource.getType(), resource.getType())) {
            return false;
        }

        Pattern resourceNamePattern = permission.getResourceNamePattern();
        Matcher resourceNameMatcher = resourceNamePattern.matcher(resource.getName());
        return resourceNameMatcher.matches();
    }

}
