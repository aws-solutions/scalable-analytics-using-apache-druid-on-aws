/*
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

package com.amazon.solutions.druid.oidc;

import com.google.inject.Inject;
import org.apache.druid.guice.LazySingleton;
import org.apache.druid.java.util.common.logger.Logger;

import javax.ws.rs.GET;
import javax.ws.rs.Path;
import javax.ws.rs.core.Response;

/**
 * Fixed Callback endpoint used after successful login with Identity Provider
 * e.g. OAuth server.
 * See https://www.pac4j.org/blog/understanding-the-callback-endpoint.html
 */
@Path(OidcCallbackResource.SELF_URL)
@LazySingleton
public class OidcCallbackResource {
    public static final String SELF_URL = "/druid-ext/druid-oidc/callback";

    private static final Logger LOGGER = new Logger(OidcCallbackResource.class);

    @Inject
    public OidcCallbackResource() {
        // do nothing
    }

    @GET
    public Response callback() {
        LOGGER.error(
                new RuntimeException(),
                "This endpoint is to be handled by the pac4j filter to redirect users, request should never reach here.");
        return Response.serverError().build();
    }
}
