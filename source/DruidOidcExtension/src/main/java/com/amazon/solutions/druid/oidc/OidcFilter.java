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

import org.apache.druid.java.util.common.logger.Logger;
import org.apache.druid.server.security.AuthConfig;
import org.apache.druid.server.security.AuthenticationResult;
import org.pac4j.core.config.Config;
import org.pac4j.core.context.J2EContext;
import org.pac4j.core.context.session.SessionStore;
import org.pac4j.core.engine.CallbackLogic;
import org.pac4j.core.engine.DefaultCallbackLogic;
import org.pac4j.core.engine.DefaultSecurityLogic;
import org.pac4j.core.engine.SecurityLogic;
import org.pac4j.core.http.adapter.HttpActionAdapter;
import org.pac4j.core.profile.CommonProfile;

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
    private final SecurityLogic<CommonProfile, J2EContext> securityLogic;
    private final CallbackLogic<CommonProfile, J2EContext> callbackLogic;
    private final SessionStore<J2EContext> sessionStore;
    private static final HttpActionAdapter<CommonProfile, J2EContext> NOOP_HTTP_ACTION_ADAPTER = (int code,
            J2EContext ctx) -> null;

    private final String name;
    private final String authorizerName;

    public OidcFilter(String name, String authorizerName, Config pac4jConfig, OidcConfig oidcConfig,
            String cookiePassphrase) {
        this(name, authorizerName, pac4jConfig, oidcConfig, cookiePassphrase, new DefaultSecurityLogic<>(),
                new DefaultCallbackLogic<>());
    }

    public OidcFilter(String name, String authorizerName, Config pac4jConfig, OidcConfig oidcConfig,
            String cookiePassphrase, SecurityLogic<CommonProfile, J2EContext> securityLogic,
            CallbackLogic<CommonProfile, J2EContext> callbackLogic) {
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
        J2EContext context = new J2EContext(httpServletRequest, httpServletResponse, sessionStore);

        if (OidcCallbackResource.SELF_URL.equals(httpServletRequest.getRequestURI())) {
            callbackLogic.perform(
                    context,
                    pac4jConfig,
                    NOOP_HTTP_ACTION_ADAPTER,
                    "/",
                    true, false, false, null);
        } else {
            CommonProfile profile = securityLogic.perform(
                    context,
                    pac4jConfig,
                    (J2EContext ctx, Collection<CommonProfile> profiles, Object... parameters) -> {
                        if (profiles.isEmpty()) {
                            logger.warn("No profiles found after OIDC auth.");
                            return null;
                        } else {
                            return profiles.iterator().next();
                        }
                    },
                    NOOP_HTTP_ACTION_ADAPTER,
                    null, null, null, null);

            if (profile != null) {
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
