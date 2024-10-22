/* 
 Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 SPDX-License-Identifier: Apache-2.0
*/
package com.amazon.solutions.druid.cloudwatch;

import org.junit.Test;
import com.fasterxml.jackson.databind.ObjectMapper;
import static org.junit.Assert.assertEquals;
import org.junit.Assert;

public class CloudwatchEmitterConfigTest {

    @Test
    public void testGetBatchSize_withValidBatchSize() {
        // given
        CloudwatchEmitterConfig config = new CloudwatchEmitterConfig("dev-cluster", 1000, "v0.0.4");

        // when
        int batchSize = config.getBatchSize();
        String clusterName = config.getClusterName();
        String solutionVersion = config.getSolutionVersion();

        // then
        assertEquals(1000, batchSize);
        assertEquals("dev-cluster", clusterName);
        assertEquals("v0.0.4", solutionVersion);
    }

    @Test
    public void testGetBatchSize_withDefaultBatchSize() {
        // given
        CloudwatchEmitterConfig config = new CloudwatchEmitterConfig("test-cluster", null, null);

        // when
        int batchSize = config.getBatchSize();
        String clusterName = config.getClusterName();
        String solutionVersion = config.getSolutionVersion();

        // then
        assertEquals(CloudwatchEmitterConfig.CLOUDWATCH_METRICS_MEMORY_LIMIT, batchSize);
        assertEquals(CloudwatchEmitterConfig.SOLUTION_VERSION, solutionVersion);
        assertEquals("test-cluster", clusterName);
    }

    @Test
    public void testToString_withValidConfig() {
        // arrange
        CloudwatchEmitterConfig config = new CloudwatchEmitterConfig("test-cluster", 200, "v1.0.5");

        // act
        String actual = config.toString();

        // assert
        Assert.assertTrue(actual.contains("test-cluster"));
        Assert.assertTrue(actual.contains("200"));
        Assert.assertTrue(actual.contains("v1.0.5"));
        Assert.assertTrue(actual.contains("CloudwatchEmitterConfig"));
    }

}