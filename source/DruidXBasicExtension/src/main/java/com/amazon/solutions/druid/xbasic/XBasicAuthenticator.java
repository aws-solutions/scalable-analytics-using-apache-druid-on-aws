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

package com.amazon.solutions.druid.xbasic;

import com.fasterxml.jackson.annotation.JsonCreator;
import com.fasterxml.jackson.annotation.JsonTypeName;
import org.apache.druid.server.security.AuthenticationResult;
import org.apache.druid.server.security.Authenticator;

import javax.annotation.Nullable;
import javax.servlet.DispatcherType;
import javax.servlet.Filter;
import java.util.EnumSet;
import java.util.Map;

@JsonTypeName("xbasic")
public class XBasicAuthenticator implements Authenticator {
    @JsonCreator
    public XBasicAuthenticator() {}

    @Override
    public Filter getFilter() {
        return new XBasicFilter();
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
}
