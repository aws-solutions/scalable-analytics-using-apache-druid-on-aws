package com.amazon.solutions.druid.xbasicauth;

import static org.junit.Assert.assertNotNull;

import javax.servlet.Filter;
import org.junit.Test;

public class XBasicAuthenticatorTest {
    private XBasicHTTPAuthenticator authenticator;
    @Test
    public void canInitialiseOidcFilter() {
        authenticator = new XBasicHTTPAuthenticator();
        Filter oidcFilter = authenticator.getFilter();

        assertNotNull(oidcFilter);
    }
}

