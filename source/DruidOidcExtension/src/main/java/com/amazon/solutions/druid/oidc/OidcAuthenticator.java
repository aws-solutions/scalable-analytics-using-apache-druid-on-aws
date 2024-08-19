/*
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

package com.amazon.solutions.druid.oidc;

import com.fasterxml.jackson.annotation.JacksonInject;
import com.fasterxml.jackson.annotation.JsonCreator;
import com.fasterxml.jackson.annotation.JsonProperty;
import com.fasterxml.jackson.annotation.JsonTypeName;
import com.google.common.base.Supplier;
import com.google.common.base.Suppliers;
import com.google.common.primitives.Ints;
import com.google.inject.Provider;
import com.nimbusds.oauth2.sdk.http.HTTPRequest;
import org.apache.druid.server.security.AuthenticationResult;
import org.apache.druid.server.security.Authenticator;
import org.pac4j.core.config.Config;
import org.pac4j.core.http.callback.NoParameterCallbackUrlResolver;
import org.pac4j.core.http.url.DefaultUrlResolver;
import org.pac4j.oidc.client.OidcClient;
import org.pac4j.oidc.config.OidcConfiguration;

import javax.annotation.Nullable;
import javax.net.ssl.SSLContext;
import javax.net.ssl.SSLSocketFactory;
import javax.servlet.DispatcherType;
import javax.servlet.Filter;
import java.util.ArrayList;
import java.util.EnumSet;
import java.util.List;
import java.util.Map;

@JsonTypeName("oidc")
public class OidcAuthenticator implements Authenticator {
    public static final String DEFAULT_SCOPE = "openid";

    private final String name;
    private final String authorizerName;
    private final Supplier<Config> pac4jConfigSupplier;
    private final SSLSocketFactory sslSocketFactory;
    private final OidcConfig oidcConfig;

    @JsonCreator
    public OidcAuthenticator(
            @JsonProperty("name") String name,
            @JsonProperty("authorizerName") String authorizerName,
            @JacksonInject OidcConfig oidcConfig,
            @JacksonInject Provider<SSLContext> sslContextSupplier) {
        this.name = name;
        this.authorizerName = authorizerName;
        this.oidcConfig = oidcConfig;

        if (oidcConfig.isEnableCustomSslContext()) {
            this.sslSocketFactory = sslContextSupplier.get().getSocketFactory();
        } else {
            this.sslSocketFactory = null;
        }

        this.pac4jConfigSupplier = Suppliers.memoize(() -> createPac4jConfig(oidcConfig));
    }

    @Override
    public Filter getFilter() {
        return new OidcFilter(
                name,
                authorizerName,
                pac4jConfigSupplier.get(), oidcConfig,
                oidcConfig.getCookiePassphrase().getPassword());
    }

    @Override
    public String getAuthChallengeHeader() {
        return null;
    }

    @Override
    @Nullable
    public AuthenticationResult authenticateJDBCContext(Map<String, Object> context) {
        return null;
    }

    @Override
    public Class<? extends Filter> getFilterClass() {
        return null;
    }

    @Override
    public Map<String, String> getInitParameters() {
        return null;
    }

    @Override
    public String getPath() {
        return "/*";
    }

    @Override
    public EnumSet<DispatcherType> getDispatcherType() {
        return null;
    }

    private Config createPac4jConfig(OidcConfig oidcConfig) {
        OidcConfiguration oidcConf = new OidcConfiguration();
        oidcConf.setClientId(oidcConfig.getClientID());
        oidcConf.setSecret(oidcConfig.getClientSecret().getPassword());
        oidcConf.setDiscoveryURI(oidcConfig.getDiscoveryURI());
        oidcConf.setExpireSessionWithToken(true);
        oidcConf.setUseNonce(true);
        oidcConf.setReadTimeout(Ints.checkedCast(oidcConfig.getReadTimeout().getMillis()));

        oidcConf.setResourceRetriever(
                // ResourceRetriever is used to get Auth server configuration from
                // "discoveryURI"
                new CustomSSLResourceRetriever(oidcConfig.getReadTimeout().getMillis(), sslSocketFactory));

        if (oidcConfig.getCustomScopes() != null) {
            List<String> finalScopes = new ArrayList<>(oidcConfig.getCustomScopes());
            if (!finalScopes.contains(DEFAULT_SCOPE)) {
                finalScopes.add(DEFAULT_SCOPE);
            }
            oidcConf.setScope(String.join(" ", finalScopes));
        }

        OidcClient oidcClient = new OidcClient(oidcConf);
        oidcClient.setUrlResolver(new DefaultUrlResolver(true));
        oidcClient.setCallbackUrlResolver(new NoParameterCallbackUrlResolver());

        // This is used by OidcClient in various places to make HTTPrequests.
        if (sslSocketFactory != null) {
            HTTPRequest.setDefaultSSLSocketFactory(sslSocketFactory);
        }

        return new Config(OidcCallbackResource.SELF_URL, oidcClient);
    }
}