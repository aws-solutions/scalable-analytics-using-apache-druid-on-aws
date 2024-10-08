/*
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

package com.amazon.solutions.druid.oidc;

import com.fasterxml.jackson.annotation.JsonCreator;
import com.fasterxml.jackson.annotation.JsonProperty;
import com.google.common.base.Preconditions;

import org.apache.druid.metadata.PasswordProvider;
import org.joda.time.Duration;

import java.util.List;

public class OidcConfig {
    @JsonProperty
    private final String clientID;

    @JsonProperty
    private final PasswordProvider clientSecret;

    @JsonProperty
    private final String discoveryURI;

    @JsonProperty
    private final String groupClaimName;

    @JsonProperty
    private final List<String> customScopes;

    @JsonProperty
    private final boolean enableCustomSslContext;

    @JsonProperty
    private final PasswordProvider cookiePassphrase;

    @JsonProperty
    private final Duration readTimeout;

    @JsonProperty
    private final String druidBaseUrl;

    @JsonProperty
    private final String druidUsername;

    @JsonProperty
    private final PasswordProvider druidPassword;

    @JsonCreator
    public OidcConfig(
            @JsonProperty("clientID") String clientID,
            @JsonProperty("clientSecret") PasswordProvider clientSecret,
            @JsonProperty("discoveryURI") String discoveryURI,
            @JsonProperty("groupClaimName") String groupClaimName,
            @JsonProperty("customScopes") List<String> customScopes,
            @JsonProperty("enableCustomSslContext") boolean enableCustomSslContext,
            @JsonProperty("cookiePassphrase") PasswordProvider cookiePassphrase,
            @JsonProperty("readTimeout") Duration readTimeout,
            @JsonProperty("druidBaseUrl") String druidBaseUrl,
            @JsonProperty("druidUsername") String druidUsername,
            @JsonProperty("druidPassword") PasswordProvider druidPassword) {
        this.clientID = Preconditions.checkNotNull(clientID, "null clientID");
        this.clientSecret = Preconditions.checkNotNull(clientSecret, "null clientSecret");
        this.discoveryURI = Preconditions.checkNotNull(discoveryURI, "null discoveryURI");
        this.groupClaimName = groupClaimName;
        this.customScopes = customScopes;
        this.enableCustomSslContext = enableCustomSslContext;
        this.cookiePassphrase = Preconditions.checkNotNull(cookiePassphrase, "null cookiePassphrase");
        this.readTimeout = readTimeout == null ? Duration.millis(5000) : readTimeout;
        this.druidBaseUrl = druidBaseUrl;
        this.druidUsername = druidUsername;
        this.druidPassword = druidPassword;
    }

    @JsonProperty
    public String getClientID() {
        return clientID;
    }

    @JsonProperty
    public PasswordProvider getClientSecret() {
        return clientSecret;
    }

    @JsonProperty
    public String getDiscoveryURI() {
        return discoveryURI;
    }

    @JsonProperty
    public String getGroupClaimName() {
        return groupClaimName;
    }

    @JsonProperty
    public List<String> getCustomScopes() {
        return customScopes;
    }

    @JsonProperty
    public boolean isEnableCustomSslContext() {
        return enableCustomSslContext;
    }

    @JsonProperty
    public PasswordProvider getCookiePassphrase() {
        return cookiePassphrase;
    }

    @JsonProperty
    public Duration getReadTimeout() {
        return readTimeout;
    }

    @JsonProperty
    public String getDruidBaseUrl() {
        return druidBaseUrl;
    }

    @JsonProperty
    public String getDruidUsername() {
        return druidUsername;
    }

    @JsonProperty
    public PasswordProvider getDruidPassword() {
        return druidPassword;
    }
}