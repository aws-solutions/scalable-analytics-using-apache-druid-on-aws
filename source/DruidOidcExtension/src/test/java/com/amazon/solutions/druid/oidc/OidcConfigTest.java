
/*
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */
package com.amazon.solutions.druid.oidc;

import org.apache.druid.jackson.DefaultObjectMapper;
import org.junit.Assert;
import org.junit.Test;

import com.fasterxml.jackson.databind.ObjectMapper;

import java.util.Arrays;

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
                + "  \"customScopes\": [\"groups\", \"druid\"],\n"
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
        Assert.assertEquals(Arrays.asList("groups", "druid"), config.getCustomScopes());
        Assert.assertEquals(true, config.isEnableCustomSslContext());
        Assert.assertEquals("testcookiePassphrase", config.getCookiePassphrase().getPassword());
        Assert.assertEquals(10_000L, config.getReadTimeout().getMillis());
    }
}