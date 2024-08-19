/*
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

package com.amazon.solutions.druid.oidc;

import com.fasterxml.jackson.databind.Module;
import com.fasterxml.jackson.databind.module.SimpleModule;
import com.google.common.collect.ImmutableList;
import com.google.inject.Binder;
import com.google.inject.Injector;
import com.google.inject.Provides;

import org.apache.druid.guice.Jerseys;
import org.apache.druid.guice.JsonConfigProvider;
import org.apache.druid.initialization.DruidModule;
import org.apache.http.client.HttpClient;
import org.apache.http.impl.client.HttpClients;

import java.util.List;

public class OidcDruidModule implements DruidModule {
    @Override
    public List<? extends Module> getJacksonModules() {
        return ImmutableList.of(
                new SimpleModule("OidcDruidSecurity").registerSubtypes(
                        OidcAuthenticator.class,
                        JwtAuthenticator.class,
                        OidcAuthorizer.class,
                        BasicAuthenticationRoleProvider.class));
    }

    @Override
    public void configure(Binder binder) {
        JsonConfigProvider.bind(binder, "druid.auth.oidc", OidcConfig.class);

        Jerseys.addResource(binder, OidcCallbackResource.class);
        binder.bind(RoleProvider.class).to(BasicAuthenticationRoleProvider.class);
    }

    @Provides
    static HttpClient createHttpClient(final Injector injector) {
        return HttpClients.createDefault();
    }
}
