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

public class BasicHTTPDruidModule implements DruidModule {
    @Override
    public List<? extends Module> getJacksonModules() {
        return ImmutableList.of(
                new SimpleModule("OidcDruidSecurity").registerSubtypes(
                        BasicHTTPAuthenticator.class,
                        BasicHTTPAuthorizer.class,
                        BasicAuthenticationRoleProvider.class));
    }

    @Override
    public void configure(Binder binder) {
        JsonConfigProvider.bind(binder, "druid.auth.oidc", OidcConfig.class);

        Jerseys.addResource(binder, BasicHTTPCallbackResource.class);
        binder.bind(RoleProvider.class).to(BasicAuthenticationRoleProvider.class);
    }

    @Provides
    static HttpClient createHttpClient(final Injector injector) {
        return HttpClients.createDefault();
    }
}
