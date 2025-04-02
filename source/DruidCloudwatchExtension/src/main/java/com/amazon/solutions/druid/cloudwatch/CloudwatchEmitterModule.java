/* 
 Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 SPDX-License-Identifier: Apache-2.0
*/
package com.amazon.solutions.druid.cloudwatch;

import com.fasterxml.jackson.databind.Module;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.google.inject.Binder;
import com.google.inject.Provides;
import com.google.inject.name.Named;
import org.apache.druid.guice.JsonConfigProvider;
import org.apache.druid.guice.ManageLifecycle;
import org.apache.druid.initialization.DruidModule;
import org.apache.druid.java.util.emitter.core.Emitter;

import java.util.Collections;
import java.util.List;

public class CloudwatchEmitterModule implements DruidModule {
    public static final String EMITTER_TYPE = "cloudwatch";

    @Override
    public List<? extends Module> getJacksonModules() {
        return Collections.emptyList();
    }

    @Override
    public void configure(final Binder binder) {
        JsonConfigProvider.bind(binder, "druid.emitter." + EMITTER_TYPE, CloudwatchEmitterConfig.class);
    }

    @Provides
    @ManageLifecycle
    @Named(EMITTER_TYPE)
    public Emitter getEmitter(final CloudwatchEmitterConfig cloudwatchEmitterConfig, ObjectMapper mapper)
    {
        return new CloudwatchEmitter(cloudwatchEmitterConfig, mapper);
    }
}
