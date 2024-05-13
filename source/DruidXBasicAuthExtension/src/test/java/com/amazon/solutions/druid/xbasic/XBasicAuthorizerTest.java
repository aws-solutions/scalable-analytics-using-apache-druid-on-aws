package com.amazon.solutions.druid.xbasic;

import static org.junit.Assert.assertTrue;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

import java.util.HashMap;
import java.util.Map;
import org.apache.druid.server.security.Access;
import org.apache.druid.server.security.Action;
import org.apache.druid.server.security.AuthenticationResult;
import org.apache.druid.server.security.Resource;
import org.junit.Before;
import org.junit.Test;

public class XBasicAuthorizerTest {
    private XBasicAuthorizer authorizer;
    private Resource resource;
    private Map<String, Object> context;
    private AuthenticationResult result;

    @Before
    public void setUp() {
        result = mock(AuthenticationResult.class);

        context = new HashMap<>();
        when(result.getContext()).thenReturn(context);
        resource = new Resource("resourceName", "resourceType");

        authorizer = new XBasicAuthorizer();
    }

    @Test
    public void allow_any_request() {
        // arrange
        when(result.getContext()).thenReturn(null);

        // act
        Access access = authorizer.authorize(result, resource, Action.READ);

        // assert
        assertTrue(access.isAllowed());
    }

}
