/* 
 Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 SPDX-License-Identifier: Apache-2.0
*/
package com.amazon.solutions.druid.cloudwatch;

import org.junit.Before;
import org.junit.Test;
import com.amazonaws.services.cloudwatch.model.StandardUnit;
import static org.junit.Assert.*;
import java.util.concurrent.TimeUnit;

public class CloudwatchMetricUnitsTest {
    private CloudwatchMetricUnits metricUnits;

    @Before
    public void setUp() {
        metricUnits = new CloudwatchMetricUnits();
    }

    @Test
    public void shouldBeWhiteListed() {
        assertTrue(metricUnits.isWhiteListed("query/cache/total/hitRate"));
        assertTrue(metricUnits.isWhiteListed("jvm/gc/mem/capacity"));
        assertTrue(metricUnits.isWhiteListed("task/pending/count"));
        assertTrue(metricUnits.isWhiteListed("segment/loadQueue/count"));
        assertTrue(metricUnits.isWhiteListed("taskSlot/blacklisted/count"));
        assertTrue(metricUnits.isWhiteListed("task/running/count"));
        assertTrue(metricUnits.isWhiteListed("ingest/events/messageGap"));
    }

    @Test
    public void shouldNotBeWhiteListed() {
        assertFalse(metricUnits.isWhiteListed("sys/disk/write/count"));
        assertFalse(metricUnits.isWhiteListed("cgroup/cpuset/effective_mems_count"));
        assertFalse(metricUnits.isWhiteListed("sqlQuery/planningTimeMs"));
        assertFalse(metricUnits.isWhiteListed("segment/loadQueue/count2"));
    }   

    @Test
    public void testGetValue() {
        assertEquals(1, metricUnits.getValue("query/cache/total/hitRate", 1.0), 0.001);
        assertEquals(TimeUnit.NANOSECONDS.toMillis(1), metricUnits.getValue(CloudwatchMetricUnits.JVM_GC_CPU, 1), 0.001);
    }

    @Test
    public void testGetUnit() {
        assertEquals(StandardUnit.Percent, metricUnits.getUnit("query/cache/total/hitRate"));
        assertEquals(StandardUnit.Bytes, metricUnits.getUnit("jvm/gc/mem/capacity"));
        assertEquals(StandardUnit.Milliseconds, metricUnits.getUnit("query/node/time"));
        assertEquals(StandardUnit.Milliseconds, metricUnits.getUnit("query/segmentAndCache/time"));
        assertEquals(StandardUnit.Milliseconds, metricUnits.getUnit("ingest/persists/backPressure"));
        assertEquals(StandardUnit.Count, metricUnits.getUnit("Unknown"));
    }
        
}