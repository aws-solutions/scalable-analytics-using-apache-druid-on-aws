/* 
 Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 SPDX-License-Identifier: Apache-2.0
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
    static final String SOLUTION_VERSION = "v1.0.4";

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