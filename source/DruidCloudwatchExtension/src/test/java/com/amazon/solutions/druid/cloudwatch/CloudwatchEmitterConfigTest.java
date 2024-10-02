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
        CloudwatchEmitterConfig config = new CloudwatchEmitterConfig("test-cluster", 200, "v1.0.0");

        // act
        String actual = config.toString();

        // assert
        Assert.assertTrue(actual.contains("test-cluster"));
        Assert.assertTrue(actual.contains("200"));
        Assert.assertTrue(actual.contains("v1.0.0"));
        Assert.assertTrue(actual.contains("CloudwatchEmitterConfig"));
    }

}