/*
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */
package com.amazon.solutions.druid.oidc;

import org.easymock.Capture;
import org.easymock.EasyMock;
import org.junit.Assert;
import org.junit.Test;
import org.pac4j.core.context.Cookie;
import org.pac4j.core.context.WebContext;

import java.util.Collections;
import java.util.Optional;

public class OidcSessionStoreTest {
    @Test
    public void testSetAndGet() {
        OidcSessionStore<WebContext> sessionStore = new OidcSessionStore<WebContext>("test-cookie-passphrase");

        WebContext webContext1 = EasyMock.mock(WebContext.class);
        EasyMock.expect(webContext1.getScheme()).andReturn("https");
        Capture<Cookie> cookieCapture = EasyMock.newCapture();

        webContext1.addResponseCookie(EasyMock.capture(cookieCapture));
        EasyMock.replay(webContext1);

        sessionStore.set(webContext1, "key", "value");

        Cookie cookie = cookieCapture.getValue();
        Assert.assertTrue(cookie.isSecure());
        Assert.assertTrue(cookie.isHttpOnly());
        Assert.assertTrue(cookie.isSecure());
        Assert.assertEquals(3600, cookie.getMaxAge());

        WebContext webContext2 = EasyMock.mock(WebContext.class);
        EasyMock.expect(webContext2.getRequestCookies()).andReturn(Collections.singletonList(cookie));
        EasyMock.replay(webContext2);

        Assert.assertEquals(Optional.of("value"), sessionStore.get(webContext2, "key"));
    }

    @Test
    public void testSetNull() {
        OidcSessionStore<WebContext> sessionStore = new OidcSessionStore<WebContext>("test-cookie-passphrase");

        WebContext webContext = EasyMock.mock(WebContext.class);
        EasyMock.expect(webContext.getScheme()).andReturn("https");
        Capture<Cookie> cookieCapture = EasyMock.newCapture();

        webContext.addResponseCookie(EasyMock.capture(cookieCapture));
        EasyMock.replay(webContext);

        sessionStore.set(webContext, "key", null);

        Cookie cookie = cookieCapture.getValue();
        Assert.assertNull(cookie.getValue());
        Assert.assertFalse(sessionStore.buildFromTrackableSession(webContext, cookie).isPresent());
        Assert.assertFalse(sessionStore.destroySession(webContext));
        Assert.assertFalse(sessionStore.getTrackableSession(webContext).isPresent());
        Assert.assertFalse(sessionStore.renewSession(webContext));
    }
}