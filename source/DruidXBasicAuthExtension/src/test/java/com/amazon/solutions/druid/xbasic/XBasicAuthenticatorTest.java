package com.amazon.solutions.druid.xbasic;

import static org.junit.Assert.assertNotNull;

import javax.servlet.Filter;
import org.junit.Test;

public class XBasicAuthenticatorTest {
    private XBasicAuthenticator authenticator;
    @Test
    public void canInitialiseOidcFilter() {
        authenticator = new XBasicAuthenticator();
        Filter oidcFilter = authenticator.getFilter();

        assertNotNull(oidcFilter);
    }
}

