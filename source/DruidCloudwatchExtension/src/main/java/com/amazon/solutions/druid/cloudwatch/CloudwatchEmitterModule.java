/* 
  Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
  
  Licensed under the Apache License, Version 2.0 (the "License").
  You may not use this file except in compliance with the License.
  You may obtain a copy of the License at
  
      http://www.apache.org/licenses/LICENSE-2.0
  
  Unless required by applicable law or agreed to in writing, software
  distributed under the License is distributed on an "AS IS" BASIS,
  WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
  See the License for the specific language governing permissions and
  limitations under the License.
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
