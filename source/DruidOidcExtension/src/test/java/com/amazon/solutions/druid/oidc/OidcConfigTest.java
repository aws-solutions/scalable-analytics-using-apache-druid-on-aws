
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

import org.apache.druid.jackson.DefaultObjectMapper;
import org.junit.Assert;
import org.junit.Test;

import com.fasterxml.jackson.databind.ObjectMapper;

public class OidcConfigTest {
    @Test
    public void canParseConfig() throws Exception {
        // arrange
        ObjectMapper mapper = new DefaultObjectMapper();

        String jsonString = "{\n"
                + "  \"clientID\": \"testid\",\n"
                + "  \"clientSecret\": \"testsecret\",\n"
                + "  \"discoveryURI\": \"testdiscoveryuri\",\n"
                + "  \"groupClaimName\": \"group\",\n"
                + "  \"enableCustomSslContext\": true,\n"
                + "  \"cookiePassphrase\": \"testcookiePassphrase\",\n"
                + "  \"readTimeout\": \"PT10S\",\n"
                + "  \"groupPermissionMap\": \"testPermissionMap\"\n"
                + "}\n";

        // act
        OidcConfig config = mapper.readValue(
                mapper.writeValueAsString(mapper.readValue(jsonString, OidcConfig.class)),
                OidcConfig.class);

        // assert
        Assert.assertEquals("testid", config.getClientID());
        Assert.assertEquals("testsecret", config.getClientSecret().getPassword());
        Assert.assertEquals("testdiscoveryuri", config.getDiscoveryURI());
        Assert.assertEquals("group", config.getGroupClaimName());
        Assert.assertEquals(true, config.isEnableCustomSslContext());
        Assert.assertEquals("testcookiePassphrase", config.getCookiePassphrase().getPassword());
        Assert.assertEquals(10_000L, config.getReadTimeout().getMillis());

    }
}
