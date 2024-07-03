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

import com.fasterxml.jackson.annotation.JsonCreator;
import com.fasterxml.jackson.annotation.JsonProperty;
import lombok.Data;
import javax.annotation.Nullable;
import com.google.common.base.Preconditions;

@Data
public class CloudwatchEmitterConfig {
    static final int CLOUDWATCH_METRICS_MEMORY_LIMIT = 100000000;
    static final String SOLUTION_VERSION = "v1.0.1";

    @JsonProperty("batchSize")
    @Nullable
    private final Integer batchSize;

    @JsonProperty("clusterName")
    private final String clusterName;

    @JsonProperty("solutionVersion")
    @Nullable
    private final String solutionVersion;

    @JsonCreator
    public CloudwatchEmitterConfig(
        @JsonProperty("clusterName") String clusterName,
        @JsonProperty("batchSize") @Nullable Integer batchSize,
        @JsonProperty("solutionVersion") @Nullable String solutionVersion
    ) {
        this.clusterName = Preconditions.checkNotNull(clusterName, "clusterName cannot be null.");
        this.batchSize = batchSize == null ? CLOUDWATCH_METRICS_MEMORY_LIMIT : batchSize;
        this.solutionVersion = solutionVersion == null ? SOLUTION_VERSION : solutionVersion;
    }

    @Override
    public String toString() {
        StringBuilder sb = new StringBuilder();
        sb.append("CloudwatchEmitterConfig{");
        sb.append("clusterName=").append(clusterName);
        sb.append(", batchSize=").append(batchSize);
        sb.append(", solutionVersion=").append(solutionVersion);
        sb.append("}");

        return sb.toString();
    }
}