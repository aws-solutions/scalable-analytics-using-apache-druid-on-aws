/*
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

package com.amazon.solutions.druid.oidc;

import static org.junit.Assert.assertNotNull;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import java.io.IOException;
import java.util.HashMap;

import javax.servlet.FilterChain;
import javax.servlet.ServletException;
import javax.servlet.http.HttpServletRequest;
import javax.servlet.http.HttpServletResponse;

import org.apache.druid.server.security.AuthenticationResult;
import org.junit.Before;
import org.junit.Test;
import org.pac4j.core.config.Config;
import org.pac4j.core.context.JEEContext;
import org.pac4j.core.engine.CallbackLogic;
import org.pac4j.core.engine.SecurityLogic;
import org.pac4j.core.http.adapter.HttpActionAdapter;
import org.pac4j.core.profile.CommonProfile;

public class OidcFilterTest {
    private OidcFilter filter;
    private Config pac4jConfig;
    private OidcConfig oidcConfig;
    private SecurityLogic<Object, JEEContext> securityLogic;
    private CallbackLogic<Object, JEEContext> callbackLogic;
    private HttpServletRequest request;
    private HttpServletResponse response;

    @SuppressWarnings("unchecked")
    @Before
    public void setup() {
        pac4jConfig = mock(Config.class);
        oidcConfig = mock(OidcConfig.class);
        securityLogic = mock(SecurityLogic.class);
        callbackLogic = mock(CallbackLogic.class);
        request = mock(HttpServletRequest.class);
        response = mock(HttpServletResponse.class);

        filter = new OidcFilter("name", "authorizerName", pac4jConfig, oidcConfig, "test", securityLogic,
                callbackLogic);
    }

    @Test
    public void canInitiateFilterWithDefaultSecurityLogic() {
        filter = new OidcFilter("name", "authorizerName", pac4jConfig, oidcConfig, "test");

        assertNotNull(filter);
    }

    @SuppressWarnings("unchecked")
    @Test
    public void canProcessCallbackRequests() throws IOException, ServletException {
        // arrange
        when(request.getRequestURI()).thenReturn(OidcCallbackResource.SELF_URL);

        // act
        filter.doFilter(request, response, null);

        // assert
        verify(callbackLogic).perform(any(JEEContext.class), any(), any(HttpActionAdapter.class), eq("/"), eq(true),
                eq(false), eq(false), any());
    }

    @Test
    public void canProcessAuthenticationRequest() throws IOException, ServletException {
        // arrange
        CommonProfile profile = mock(CommonProfile.class);
        when(profile.getAttributes()).thenReturn(new HashMap<>());
        when(profile.getAttribute(anyString())).thenReturn(new Object());
        when(profile.getId()).thenReturn("my-id");
        
        when(request.getRequestURI()).thenReturn("/blah");
        when(request.getAttribute("Druid-Authentication-Result")).thenReturn(null);

        when(securityLogic.perform(any(), any(), any(), any(), any(), any(),
                any(), any())).thenReturn(profile);
        FilterChain filterChain = mock(FilterChain.class);

        // act
        filter.doFilter(request, response, filterChain);

        // assert
        verify(request).setAttribute(eq("Druid-Authentication-Result"), any(AuthenticationResult.class));
        verify(filterChain).doFilter(request, response);
    }

    @Test
    public void doNothingOnAuthenticatedRequest() throws IOException, ServletException {
        // arrange
        when(request.getRequestURI()).thenReturn("/blah");
        when(request.getAttribute("Druid-Authentication-Result")).thenReturn("something");
        FilterChain filterChain = mock(FilterChain.class);

        // act
        filter.doFilter(request, response, filterChain);

        // assert
        verify(filterChain).doFilter(request, response);
    }
}
