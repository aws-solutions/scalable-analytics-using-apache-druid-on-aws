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

import java.util.ArrayList;
import java.util.Arrays;
import java.util.Base64;
import java.util.List;
import java.util.stream.Collectors;

import org.apache.druid.java.util.common.logger.Logger;
import org.apache.http.client.HttpClient;
import org.apache.http.client.methods.HttpGet;
import org.apache.http.client.methods.HttpUriRequest;

import com.fasterxml.jackson.annotation.JacksonInject;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.google.inject.Inject;

public class BasicAuthenticationRoleProvider implements RoleProvider {

    private HttpClient httpClient;
    private ObjectMapper mapper;
    private OidcConfig config;
    private static final Logger logger = new Logger(BasicAuthenticationRoleProvider.class);

    @Inject
    public BasicAuthenticationRoleProvider(@JacksonInject HttpClient httpClient, @JacksonInject OidcConfig config) {
        this.httpClient = httpClient;
        this.config = config;
        this.mapper = new ObjectMapper();
    }

    @Override
    public ArrayList<Permission> getPermissions(ArrayList<String> groups) {
        logger.debug("Getting permissions for groups %s", groups);
        try {
            // get all groups
            String[] storedGroups = httpClient.execute(createGetRequest(
                    config.getDruidBaseUrl()
                            + "/proxy/coordinator/druid-ext/basic-security/authorization/db/basic/groupMappings"),
                    response -> mapper.readValue(response.getEntity().getContent(), String[].class));

            logger.debug("Basic security groups %s", storedGroups);

            ArrayList<String> storedGroupsArray = new ArrayList<>(Arrays.asList(storedGroups));

            // filter groups
            List<String> matchedGroups = storedGroupsArray
                    .stream()
                    .filter(groups::contains)
                    .collect(Collectors.toList());

            logger.debug("Matched basic security groups %s", matchedGroups);

            if (matchedGroups.isEmpty()) {
                return new ArrayList<>();
            }

            ArrayList<Permission> permissions = new ArrayList<>();

            for (String group : matchedGroups) {
                ArrayList<Permission> groupPermissions = getPermissionsForGroup(group);
                permissions.addAll(groupPermissions);
            }

            logger.debug("Permissions mapped to requested groups %s", permissions);

            return permissions;
        } catch (Exception e) {
            logger.error(e, "Unable to retrieve permissions data from basic security authentication API");

            return new ArrayList<>();
        }

    }

    private ArrayList<Permission> getPermissionsForGroup(String group) {
        try {
            ArrayList<String> roles = new ArrayList<>();

            String[] groupRoles = httpClient.execute(createGetRequest(
                    config.getDruidBaseUrl()
                            + "/proxy/coordinator/druid-ext/basic-security/authorization/db/basic/groupMappings/"
                            + group),
                    response -> {
                        JsonNode rootNode = mapper.readTree(response.getEntity().getContent());
                        JsonNode rolesNode = rootNode.get("roles");

                        return mapper.treeToValue(rolesNode, String[].class);

                    });

            roles.addAll(Arrays.asList(groupRoles));

            // get permissions
            ArrayList<Permission> permissions = new ArrayList<>();
            for (String role : roles) {
                Permission[] rolePermissions = httpClient.execute(createGetRequest(
                        config.getDruidBaseUrl()
                                + "/proxy/coordinator/druid-ext/basic-security/authorization/db/basic/roles/"
                                + role + "?full"),
                        response -> {
                            JsonNode rootNode = mapper.readTree(response.getEntity().getContent());
                            JsonNode permissionsNode = rootNode.get("permissions");
                            return mapper.treeToValue(permissionsNode, Permission[].class);
                        });
                permissions.addAll(Arrays.asList(rolePermissions));
            }

            return permissions;
        } catch (Exception e) {
            logger.error(e, "Unable to retrieve permissions data for group %s from basic security authentication API",
                    group);

            return new ArrayList<>();
        }
    }

    private HttpUriRequest createGetRequest(String uri) {
        HttpGet request = new HttpGet(uri);

        request.setHeader("Authorization",
                "Basic " + encodeToBase64(config.getDruidUsername() + ":" + config.getDruidPassword().getPassword()));
        return request;
    }

    private static String encodeToBase64(String input) {
        byte[] inputBytes = input.getBytes();
        byte[] encodedBytes = Base64.getEncoder().encode(inputBytes);

        return new String(encodedBytes);
    }
}
