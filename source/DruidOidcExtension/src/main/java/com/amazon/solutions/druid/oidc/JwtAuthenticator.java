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
import org.apache.druid.server.security.AuthenticationResult;
import org.apache.druid.server.security.Authenticator;
import org.pac4j.oidc.config.OidcConfiguration;
import org.pac4j.oidc.profile.creator.TokenValidator;

import javax.annotation.Nullable;
import javax.servlet.DispatcherType;
import javax.servlet.Filter;
import java.util.EnumSet;
import java.util.Map;

@JsonTypeName("jwt")
public class JwtAuthenticator implements Authenticator {
    private final String authorizerName;
    private final OidcConfig oidcConfig;
    private final Supplier<TokenValidator> tokenValidatorSupplier;
    private final String name;

    @JsonCreator
    public JwtAuthenticator(
            @JsonProperty("name") String name,
            @JsonProperty("authorizerName") String authorizerName,
            @JacksonInject OidcConfig oidcConfig) {
        this.name = name;
        this.oidcConfig = oidcConfig;
        this.authorizerName = authorizerName;

        this.tokenValidatorSupplier = Suppliers.memoize(() -> createTokenValidator(oidcConfig));
    }

    @Override
    public Filter getFilter() {
        return new JwtAuthFilter(authorizerName, name, oidcConfig, tokenValidatorSupplier.get());
    }

    @Override
    public Class<? extends Filter> getFilterClass() {
        return JwtAuthFilter.class;
    }

    @Override
    public Map<String, String> getInitParameters() {
        return null;
    }

    @Override
    public String getPath() {
        return "/*";
    }

    @Nullable
    @Override
    public EnumSet<DispatcherType> getDispatcherType() {
        return null;
    }

    @Nullable
    @Override
    public String getAuthChallengeHeader() {
        return null;
    }

    @Nullable
    @Override
    public AuthenticationResult authenticateJDBCContext(Map<String, Object> context) {
        return null;
    }

    private TokenValidator createTokenValidator(OidcConfig config) {
        OidcConfiguration oidcConfiguration = new OidcConfiguration();
        oidcConfiguration.setClientId(config.getClientID());
        oidcConfiguration.setSecret(config.getClientSecret().getPassword());
        oidcConfiguration.setDiscoveryURI(config.getDiscoveryURI());
        return new TokenValidator(oidcConfiguration);
    }
}
