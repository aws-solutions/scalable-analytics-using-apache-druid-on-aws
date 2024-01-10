/*
 * Licensed to the Apache Software Foundation (ASF) under one
 * or more contributor license agreements.  See the NOTICE file
 * distributed with this work for additional information
 * regarding copyright ownership.  The ASF licenses this file
 * to you under the Apache License, Version 2.0 (the
 * "License"); you may not use this file except in compliance
 * with the License.  You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing,
 * software distributed under the License is distributed on an
 * "AS IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY
 * KIND, either express or implied.  See the License for the
 * specific language governing permissions and limitations
 * under the License.
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