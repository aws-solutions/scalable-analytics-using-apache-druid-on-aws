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

import static org.junit.Assert.assertNotNull;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import java.io.IOException;

import javax.servlet.FilterChain;
import javax.servlet.ServletException;
import javax.servlet.http.HttpServletRequest;
import javax.servlet.http.HttpServletResponse;

import org.apache.druid.server.security.AuthenticationResult;
import org.junit.Before;
import org.junit.Test;
import org.pac4j.core.config.Config;
import org.pac4j.core.context.J2EContext;
import org.pac4j.core.engine.CallbackLogic;
import org.pac4j.core.engine.SecurityLogic;
import org.pac4j.core.http.adapter.HttpActionAdapter;
import org.pac4j.core.profile.CommonProfile;

public class OidcFilterTest {
    private OidcFilter filter;
    private Config pac4jConfig;
    private OidcConfig oidcConfig;
    private SecurityLogic<CommonProfile, J2EContext> securityLogic;
    private CallbackLogic<CommonProfile, J2EContext> callbackLogic;
    private HttpServletRequest request;
    private HttpServletResponse response;

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

    @Test
    public void canProcessCallbackRequests() throws IOException, ServletException {
        // arrange
        when(request.getRequestURI()).thenReturn(OidcCallbackResource.SELF_URL);

        // act
        filter.doFilter(request, response, null);

        // assert
        verify(callbackLogic).perform(any(J2EContext.class), any(), any(HttpActionAdapter.class), eq("/"), eq(true), eq(false), eq(false), any());
    }

    @Test
    public void canProcessAuthenticationRequest() throws IOException, ServletException {
        // arrange
        when(request.getRequestURI()).thenReturn("/blah");
        when(request.getAttribute("Druid-Authentication-Result")).thenReturn(null);
        when(securityLogic.perform(any(), any(), any(), any(), any(), any(),
                any(), any())).thenReturn(new CommonProfile(false));
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
