
/*
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */
package com.amazon.solutions.druid.oidc;

import com.google.common.collect.ImmutableMap;
import com.nimbusds.jose.JOSEException;
import com.nimbusds.jose.proc.BadJOSEException;
import com.nimbusds.jwt.JWT;
import com.nimbusds.openid.connect.sdk.claims.IDTokenClaimsSet;

import net.minidev.json.JSONArray;

import org.apache.druid.server.security.AuthConfig;
import org.easymock.EasyMock;
import org.junit.Assert;
import org.junit.Test;
import org.pac4j.oidc.profile.creator.TokenValidator;

import javax.servlet.FilterChain;
import javax.servlet.ServletException;
import javax.servlet.http.HttpServletRequest;
import javax.servlet.http.HttpServletResponse;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import java.io.IOException;

public class JwtAuthenticatorTest {
    @Test
    public void testBearerToken()
            throws IOException, ServletException {
        OidcConfig configuration = EasyMock.createMock(OidcConfig.class);
        TokenValidator tokenValidator = EasyMock.createMock(TokenValidator.class);

        HttpServletRequest req = EasyMock.createMock(HttpServletRequest.class);
        EasyMock.expect(req.getAttribute(AuthConfig.DRUID_AUTHENTICATION_RESULT)).andReturn(null);
        EasyMock.expect(req.getHeader("Authorization")).andReturn("Nobearer");

        EasyMock.replay(req);

        HttpServletResponse resp = EasyMock.createMock(HttpServletResponse.class);
        EasyMock.replay(resp);

        FilterChain filterChain = EasyMock.createMock(FilterChain.class);
        filterChain.doFilter(req, resp);
        EasyMock.expectLastCall().times(1);
        EasyMock.replay(filterChain);

        JwtAuthenticator jwtAuthenticator = new JwtAuthenticator("jwt", "allowAll", configuration);
        JwtAuthFilter authFilter = new JwtAuthFilter("allowAll", "jwt", configuration, tokenValidator);
        authFilter.doFilter(req, resp, filterChain);

        EasyMock.verify(req, resp, filterChain);
        Assert.assertEquals(jwtAuthenticator.getFilterClass(), JwtAuthFilter.class);
        Assert.assertNull(jwtAuthenticator.getInitParameters());
        Assert.assertNull(jwtAuthenticator.authenticateJDBCContext(ImmutableMap.of()));
        Assert.assertNull(jwtAuthenticator.getAuthChallengeHeader());
        Assert.assertNull(jwtAuthenticator.getDispatcherType());
        Assert.assertEquals(jwtAuthenticator.getPath(), "/*");
    }

    @Test
    public void testValidBearerToken() throws BadJOSEException, JOSEException, IOException, ServletException {
        // arrange
        OidcConfig oidcConfig = mock(OidcConfig.class);
        TokenValidator tokenValidator = mock(TokenValidator.class);
        JwtAuthFilter filter = new JwtAuthFilter("authorizer", "jwt", oidcConfig, tokenValidator);
        HttpServletRequest request = mock(HttpServletRequest.class);
        HttpServletResponse response = mock(HttpServletResponse.class);
        FilterChain chain = mock(FilterChain.class);

        IDTokenClaimsSet claims = mock(IDTokenClaimsSet.class);
        when(request.getAttribute("Druid-Authentication-Result")).thenReturn(null);
        when(request.getHeader("Authorization")).thenReturn(
                "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIiwibmFtZSI6IkpvaG4gRG9lIiwiaWF0IjoxNTE2MjM5MDIyfQ.SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c");
        when(tokenValidator.validate(any(JWT.class), any())).thenReturn(claims);
        when(claims.getStringClaim("sub")).thenReturn("subject");
        when(oidcConfig.getClientID()).thenReturn("clientId");
        when(oidcConfig.getGroupClaimName()).thenReturn("group");
        when(claims.getClaim("group", JSONArray.class)).thenReturn(new JSONArray());

        // act
        filter.doFilter(request, response, chain);

        // assert
        verify(request).setAttribute(eq("Druid-Authentication-Result"), any(Object.class));
    }

    @Test
    public void testAuthenticatedRequest() throws ServletException, IOException {
        HttpServletRequest req = EasyMock.createMock(HttpServletRequest.class);
        EasyMock.expect(req.getAttribute(AuthConfig.DRUID_AUTHENTICATION_RESULT)).andReturn("AlreadyAuthenticated");

        EasyMock.replay(req);

        HttpServletResponse resp = EasyMock.createMock(HttpServletResponse.class);
        EasyMock.replay(resp);

        FilterChain filterChain = EasyMock.createMock(FilterChain.class);
        filterChain.doFilter(req, resp);
        EasyMock.expectLastCall().times(1);
        EasyMock.replay(filterChain);

        JwtAuthFilter authFilter = new JwtAuthFilter("allowAll", "jwt", null, null);
        authFilter.doFilter(req, resp, filterChain);

        EasyMock.verify(req, resp, filterChain);
    }
}
