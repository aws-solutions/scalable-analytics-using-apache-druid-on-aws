/*
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

package com.amazon.solutions.druid.oidc;

import java.util.regex.Pattern;

import org.apache.druid.server.security.ResourceAction;

import com.fasterxml.jackson.annotation.JsonCreator;
import com.fasterxml.jackson.annotation.JsonProperty;

public class Permission {
    private final ResourceAction resourceAction;
    private final Pattern resourceNamePattern;

    @JsonCreator
    public Permission(
            @JsonProperty("resourceAction") ResourceAction resourceAction,
            @JsonProperty("resourceNamePattern") Pattern resourceNamePattern) {
        this.resourceAction = resourceAction;
        this.resourceNamePattern = resourceNamePattern;
    }

    @JsonProperty
    public ResourceAction getResourceAction() {
        return resourceAction;
    }

    @JsonProperty
    public Pattern getResourceNamePattern() {
        return resourceNamePattern;
    }

    @Override
    public boolean equals(Object o) {
        if (this == o) {
            return true;
        }
        if (o == null || getClass() != o.getClass()) {
            return false;
        }

        Permission that = (Permission) o;

        if (getResourceAction() != null
                ? !getResourceAction().equals(that.getResourceAction())
                : that.getResourceAction() != null) {
            return false;
        }
        return getResourceNamePattern() != null
                ? getResourceNamePattern().pattern().equals(that.getResourceNamePattern().pattern())
                : that.getResourceNamePattern() == null;

    }

    @Override
    public int hashCode() {
        int result = getResourceAction() != null ? getResourceAction().hashCode() : 0;
        result = 31 * result + (getResourceNamePattern().pattern() != null
                ? getResourceNamePattern().pattern().hashCode()
                : 0);
        return result;
    }

    @Override
    public String toString() {
        return "BasicAuthorizerPermission{" +
                "resourceAction=" + resourceAction +
                ", resourceNamePattern=" + resourceNamePattern +
                '}';
    }
}