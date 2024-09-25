/*
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

package com.amazon.solutions.druid.oidc;

import static org.junit.Assert.assertNotNull;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

import javax.net.ssl.SSLContext;
import javax.servlet.Filter;

import org.apache.druid.metadata.PasswordProvider;
import org.joda.time.Duration;
import org.junit.Before;
import org.junit.Test;

import com.google.inject.Provider;

import java.util.Arrays;

public class OidcAuthenticatorTest {
    private OidcConfig config;
    private Provider<SSLContext> provider;
    private OidcAuthenticator authenticator;

    @Before
    public void setup() {
        config = mock(OidcConfig.class);
        provider = mock(Provider.class);
        PasswordProvider passwordProvider = mock(PasswordProvider.class);

        when(config.getClientID()).thenReturn("clientId");
        when(config.getClientSecret()).thenReturn(passwordProvider);
        when(config.getCookiePassphrase()).thenReturn(passwordProvider);
        when(passwordProvider.getPassword()).thenReturn("secret");
        when(config.getDiscoveryURI()).thenReturn("http://localhost");
        when(config.getReadTimeout()).thenReturn(new Duration(10));
    }

    @Test
    public void canInitialiseOidcFilter() {
        authenticator = new OidcAuthenticator("name", "authorizerName", config, provider);
        Filter oidcFilter = authenticator.getFilter();

        assertNotNull(oidcFilter);
    }

    @Test
    public void canInitialiseOidcFilterWithoutCustomScopes() {
        when(config.getCustomScopes()).thenReturn(null);
        authenticator = new OidcAuthenticator("name", "authorizerName", config, provider);
        Filter oidcFilter = authenticator.getFilter();

        assertNotNull(oidcFilter);
    }

    @Test
    public void canInitialiseOidcFilterWithCustomScopes() {
        when(config.getCustomScopes()).thenReturn(Arrays.asList("groups", "druid"));
        authenticator = new OidcAuthenticator("name", "authorizerName", config, provider);
        Filter oidcFilter = authenticator.getFilter();

        assertNotNull(oidcFilter);
    }
}