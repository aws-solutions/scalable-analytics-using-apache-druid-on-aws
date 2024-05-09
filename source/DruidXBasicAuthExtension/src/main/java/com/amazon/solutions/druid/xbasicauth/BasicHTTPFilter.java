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

package com.amazon.solutions.druid.xbasicauth;

import java.util.Collections;
import java.util.Enumeration;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import javax.servlet.http.HttpServletRequestWrapper;
import org.apache.druid.java.util.common.logger.Logger;
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

public class BasicHTTPFilter implements Filter {
    private static final Logger logger = new Logger(BasicHTTPFilter.class);

    private final Config pac4jConfig;
    private final OidcConfig oidcConfig;
    private final SecurityLogic<CommonProfile, J2EContext> securityLogic;
    private final CallbackLogic<CommonProfile, J2EContext> callbackLogic;
    private final SessionStore<J2EContext> sessionStore;
    private static final HttpActionAdapter<CommonProfile, J2EContext> NOOP_HTTP_ACTION_ADAPTER = (int code,
            J2EContext ctx) -> null;

    private final String name;
    private final String authorizerName;

    public BasicHTTPFilter(String name, String authorizerName, Config pac4jConfig, OidcConfig oidcConfig,
                           String cookiePassphrase) {
        this(name, authorizerName, pac4jConfig, oidcConfig, cookiePassphrase, new DefaultSecurityLogic<>(),
                new DefaultCallbackLogic<>());
    }

    public BasicHTTPFilter(String name, String authorizerName, Config pac4jConfig, OidcConfig oidcConfig,
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
        HttpServletRequest httpServletRequest = (HttpServletRequest) servletRequest;
        HttpServletResponse httpServletResponse = (HttpServletResponse) servletResponse;
        String xBasicHeader = httpServletRequest.getHeader("x-authorization");

        HeaderMapRequestWrapper requestWrapper = new HeaderMapRequestWrapper(httpServletRequest);

        if (xBasicHeader != null) {
            requestWrapper.setHeader("Authorization", xBasicHeader);
        }

        filterChain.doFilter(requestWrapper, httpServletResponse);
    }

    @Override
    public void destroy() {
        // do nothing
    }

    class HeaderMapRequestWrapper extends HttpServletRequestWrapper {
        public HeaderMapRequestWrapper(HttpServletRequest request) {
            super(request);
        }

        private Map<String, String> headerMap = new HashMap<String, String>();

        public void setHeader(String name, String value) {
            headerMap.put(name, value);
        }

        @Override
        public String getHeader(String name) {
            String headerValue = super.getHeader(name);
            if (headerMap.containsKey(name)) {
                headerValue = headerMap.get(name);
            }
            return headerValue;
        }

        @Override
        public Enumeration<String> getHeaderNames() {
            List<String> names = Collections.list(super.getHeaderNames());
            for (String name : headerMap.keySet()) {
                names.add(name);
            }
            return Collections.enumeration(names);
        }

        @Override
        public Enumeration<String> getHeaders(String name) {
            List<String> values = Collections.list(super.getHeaders(name));
            if (headerMap.containsKey(name)) {
                values.add(headerMap.get(name));
            }
            return Collections.enumeration(values);
        }
    }
}

