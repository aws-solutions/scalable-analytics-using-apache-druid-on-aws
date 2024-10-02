
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

import static org.junit.Assert.assertEquals;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

import java.io.IOException;
import java.util.ArrayList;

import org.apache.druid.metadata.PasswordProvider;
import org.apache.http.client.ClientProtocolException;
import org.apache.http.client.HttpClient;
import org.apache.http.impl.client.HttpClients;
import org.junit.Before;
import org.junit.Test;

import okhttp3.mockwebserver.MockResponse;
import okhttp3.mockwebserver.MockWebServer;

public class BasicAuthenticationRoleProviderTest {
    private MockWebServer server;
    private OidcConfig oidcConfig;
    private BasicAuthenticationRoleProvider roleProvider;
    private ArrayList<String> inputGroups = new ArrayList<>();

    @Before
    public void setUp() throws ClientProtocolException, IOException {
        server = new MockWebServer();
        HttpClient httpClient = HttpClients.createDefault();
        oidcConfig = mock(OidcConfig.class);

        inputGroups.add("my-group");
        roleProvider = new BasicAuthenticationRoleProvider(httpClient, oidcConfig);

        when(oidcConfig.getDruidBaseUrl()).thenReturn(server.url("/").toString());
        when(oidcConfig.getDruidUsername()).thenReturn("username");
        when(oidcConfig.getDruidPassword()).thenReturn(mock(PasswordProvider.class));
    }

    @Test
    public void return_empty_collection_if_no_group_mapping_exists() {
        // arrange
        server.enqueue(createMockResponse("[]"));

        // act
        ArrayList<Permission> permissions = roleProvider.getPermissions(inputGroups);

        // assert
        assertEquals(permissions.size(), 0);
    }

    @Test
    public void return_permission_list() {
        // arrange
        server.enqueue(createMockResponse("[\"my-group\"]"));
        server.enqueue(createMockResponse(
                "{\"name\":\"my-group\",\"groupPattern\":\"my-group\",\"roles\":[\"administrator\"]}"));
        server.enqueue(createMockResponse(
                "{\"name\":\"read\",\"users\":[],\"groups\":[\"scrum-masters\"],\"permissions\":[{\"resourceAction\":{\"resource\":{\"name\":\".*\",\"type\":\"DATASOURCE\"},\"action\":\"READ\"},\"resourceNamePattern\":\".*\"},{\"resourceAction\":{\"resource\":{\"name\":\".*\",\"type\":\"STATE\"},\"action\":\"READ\"},\"resourceNamePattern\":\".*\"}]}"));

        // act
        ArrayList<Permission> permissions = roleProvider.getPermissions(inputGroups);

        // assert
        assertEquals(permissions.size(), 2);
    }

    private static MockResponse createMockResponse(String body) {
        return new MockResponse()
                .addHeader("Content-Type", "application/json; charset=utf-8")
                .setBody(body)
                .setResponseCode(200);
    }
}
