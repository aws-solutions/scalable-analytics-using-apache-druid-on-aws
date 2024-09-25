/*
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

package com.amazon.solutions.druid.oidc;

import org.apache.druid.java.util.common.logger.Logger;
import org.apache.druid.server.security.AuthConfig;
import org.apache.druid.server.security.AuthenticationResult;
import org.pac4j.core.config.Config;
import org.pac4j.core.context.JEEContext;
import org.pac4j.core.context.session.SessionStore;
import org.pac4j.core.engine.CallbackLogic;
import org.pac4j.core.engine.DefaultCallbackLogic;
import org.pac4j.core.engine.DefaultSecurityLogic;
import org.pac4j.core.engine.SecurityLogic;
import org.pac4j.core.http.adapter.JEEHttpActionAdapter;
import org.pac4j.core.profile.CommonProfile;
import org.pac4j.core.profile.UserProfile;

import javax.servlet.Filter;
import javax.servlet.FilterChain;
import javax.servlet.FilterConfig;
import javax.servlet.ServletException;
import javax.servlet.ServletRequest;
import javax.servlet.ServletResponse;
import javax.servlet.http.HttpServletRequest;
import javax.servlet.http.HttpServletResponse;
import java.io.IOException;
import java.util.Collection;

public class OidcFilter implements Filter {
    private static final Logger logger = new Logger(OidcFilter.class);

    private final Config pac4jConfig;
    private final OidcConfig oidcConfig;
    private final SecurityLogic<Object, JEEContext> securityLogic;
    private final CallbackLogic<Object, JEEContext> callbackLogic;
    private final SessionStore<JEEContext> sessionStore;

    private final String name;
    private final String authorizerName;

    public OidcFilter(String name, String authorizerName, Config pac4jConfig, OidcConfig oidcConfig,
            String cookiePassphrase) {
        this(name, authorizerName, pac4jConfig, oidcConfig, cookiePassphrase, new DefaultSecurityLogic<>(),
                new DefaultCallbackLogic<>());
    }

    public OidcFilter(String name, String authorizerName, Config pac4jConfig, OidcConfig oidcConfig,
            String cookiePassphrase, SecurityLogic<Object, JEEContext> securityLogic,
            CallbackLogic<Object, JEEContext> callbackLogic) {
        this.pac4jConfig = pac4jConfig;
        this.oidcConfig = oidcConfig;
        this.securityLogic = securityLogic;
        this.callbackLogic = callbackLogic;

        this.name = name;
        this.authorizerName = authorizerName;

        this.sessionStore = new OidcSessionStore<>(cookiePassphrase);
    }

    @Override
    public void init(FilterConfig filterConfig) {
        // do nothing
    }

    @Override
    public void doFilter(ServletRequest servletRequest, ServletResponse servletResponse, FilterChain filterChain)
            throws IOException, ServletException {
        // If there's already an auth result, then we have authenticated already, skip
        // this or else caller
        // could get HTTP redirect even if one of the druid authenticators in chain has
        // successfully authenticated.
        if (servletRequest.getAttribute(AuthConfig.DRUID_AUTHENTICATION_RESULT) != null) {
            filterChain.doFilter(servletRequest, servletResponse);
            return;
        }

        HttpServletRequest httpServletRequest = (HttpServletRequest) servletRequest;
        HttpServletResponse httpServletResponse = (HttpServletResponse) servletResponse;
        JEEContext context = new JEEContext(httpServletRequest, httpServletResponse, sessionStore);

        if (OidcCallbackResource.SELF_URL.equals(httpServletRequest.getRequestURI())) {
            callbackLogic.perform(
                    context,
                    pac4jConfig,
                    JEEHttpActionAdapter.INSTANCE,
                    "/",
                    true, false, false, null);
        } else {
            CommonProfile profile = (CommonProfile) securityLogic.perform(
                    context,
                    pac4jConfig,
                    (JEEContext ctx, Collection<UserProfile> profiles, Object... parameters) -> {
                        if (profiles.isEmpty()) {
                            logger.warn("No profiles found after OIDC auth.");
                            return null;
                        } else {
                            return profiles.iterator().next();
                        }
                    },
                    JEEHttpActionAdapter.INSTANCE,
                    null, "none", null, null);
            // Changed the Authorizer from null to "none".
            // In the older version, if it is null, it simply grant access and returns
            // authorized.
            // But in the newer pac4j version, it uses CsrfAuthorizer as default, And
            // because of this, It was returning 403 in API calls.
            if (profile != null && profile.getId() != null) {
                logger.debug("Oidc attributes [%s]", profile.getAttributes());
                logger.debug("Group claim [%s]", profile.getAttribute(oidcConfig.getGroupClaimName()));

                AuthenticationResult authenticationResult = new AuthenticationResult(profile.getId(),
                    authorizerName, name, profile.getAttributes());
                httpServletRequest.setAttribute(AuthConfig.DRUID_AUTHENTICATION_RESULT, 
                    authenticationResult);
                filterChain.doFilter(httpServletRequest, httpServletResponse);
            }
        }
    }

    @Override
    public void destroy() {
        // do nothing
    }
}
