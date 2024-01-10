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

import com.amazonaws.services.cloudwatch.model.StandardUnit;

import java.util.HashMap;
import java.util.Map;
import java.util.concurrent.TimeUnit;

public class CloudwatchMetricUnits {

    static final String JVM_GC_CPU = "jvm/gc/cpu";

    private final Map<String, StandardUnit> metricUnitsMap = new HashMap<>();

    public CloudwatchMetricUnits() {
        fillMetricUnitsMap();
    }

    private void fillMetricUnitsMap() {

        //https://druid.apache.org/docs/0.19.0/operations/metrics.htm

        // JVM Metrics
        metricUnitsMap.put("jvm/gc/mem/capacity", StandardUnit.Bytes);
        metricUnitsMap.put("jvm/gc/mem/used", StandardUnit.Bytes);
        metricUnitsMap.put("jvm/gc/mem/init", StandardUnit.Bytes);
        metricUnitsMap.put("jvm/gc/mem/max", StandardUnit.Bytes);
        metricUnitsMap.put("jvm/gc/count", StandardUnit.Count);
        metricUnitsMap.put(JVM_GC_CPU, StandardUnit.Milliseconds);
        metricUnitsMap.put("jvm/mem/used", StandardUnit.Bytes);
        metricUnitsMap.put("jvm/mem/max", StandardUnit.Bytes);


        //jetty
        metricUnitsMap.put("jetty/numOpenConnections",StandardUnit.Count);
        metricUnitsMap.put("jetty/threadPool/total",StandardUnit.Count);
        metricUnitsMap.put("jetty/threadPool/idle",StandardUnit.Count);
        metricUnitsMap.put("jetty/threadPool/busy",StandardUnit.Count);
        metricUnitsMap.put("jetty/threadPool/queueSize",StandardUnit.Count);


        // Cache Metrics
        metricUnitsMap.put("query/cache/total/averageBytes", StandardUnit.Bytes);
        metricUnitsMap.put("query/cache/total/hitRate", StandardUnit.Percent);
        metricUnitsMap.put("query/cache/total/timeouts", StandardUnit.Count);
        metricUnitsMap.put("query/cache/total/errors", StandardUnit.Count);
        metricUnitsMap.put("query/cache/total/evictions", StandardUnit.Count);
        metricUnitsMap.put("query/cache/total/misses", StandardUnit.Count);
        metricUnitsMap.put("query/cache/total/hits", StandardUnit.Count);
        metricUnitsMap.put("query/cache/total/sizeBytes", StandardUnit.Bytes);
        metricUnitsMap.put("query/cache/total/numEntries", StandardUnit.Count);
        metricUnitsMap.put("query/cache/total/put/ok",StandardUnit.Count);
        metricUnitsMap.put("query/cache/total/put/error",StandardUnit.Count);
        metricUnitsMap.put("query/cache/total/put/oversized",StandardUnit.Count);

        // Broker Query Metrics
        metricUnitsMap.put("query/time", StandardUnit.Milliseconds);
        metricUnitsMap.put("query/bytes", StandardUnit.Bytes);
        metricUnitsMap.put("query/node/time", StandardUnit.Milliseconds);
        metricUnitsMap.put("query/node/bytes", StandardUnit.Bytes);
        metricUnitsMap.put("query/node/ttfb", StandardUnit.Milliseconds);
        metricUnitsMap.put("query/intervalChunk/time", StandardUnit.Milliseconds);
        metricUnitsMap.put("query/success/count", StandardUnit.Count);
        metricUnitsMap.put("query/failed/count", StandardUnit.Count);
        metricUnitsMap.put("query/interrupted/count", StandardUnit.Count);
        metricUnitsMap.put("query/count",StandardUnit.Count);
        metricUnitsMap.put("sqlQuery/time",StandardUnit.Milliseconds);
        metricUnitsMap.put("sqlQuery/bytes",StandardUnit.Bytes);

        // Historical Query Metrics
        metricUnitsMap.put("query/segment/time", StandardUnit.Milliseconds);
        metricUnitsMap.put("query/wait/time", StandardUnit.Milliseconds);
        metricUnitsMap.put("segment/scan/pending", StandardUnit.Count);
        metricUnitsMap.put("query/segmentAndCache/time", StandardUnit.Milliseconds);
        metricUnitsMap.put("query/cpu/time", StandardUnit.Microseconds);
        metricUnitsMap.put("segment/max",StandardUnit.Bytes);
        metricUnitsMap.put("segment/used",StandardUnit.Bytes);
        metricUnitsMap.put("segment/usedPercent",StandardUnit.Percent);
        metricUnitsMap.put("segment/pendingDelete",StandardUnit.Bytes);

        //Coordination Query Metrics
        metricUnitsMap.put("segment/loadQueue/failed", StandardUnit.Count);
        metricUnitsMap.put("segment/loadQueue/count", StandardUnit.Count);
        metricUnitsMap.put("segment/size", StandardUnit.Bytes);
        metricUnitsMap.put("segment/count", StandardUnit.Count);
        metricUnitsMap.put("segment/assigned/count",StandardUnit.Count);
        metricUnitsMap.put("segment/moved/count",StandardUnit.Count);
        metricUnitsMap.put("segment/dropped/count",StandardUnit.Count);
        metricUnitsMap.put("segment/deleted/count",StandardUnit.Count);
        metricUnitsMap.put("segment/unneeded/count",StandardUnit.Count);
        metricUnitsMap.put("segment/loadQueue/size",StandardUnit.Count);
        metricUnitsMap.put("segment/dropQueue/count",StandardUnit.Count);
        metricUnitsMap.put("segment/unavailable/count",StandardUnit.Count);
        metricUnitsMap.put("segment/underReplicated/count",StandardUnit.Count);
        metricUnitsMap.put("tier/historical/count",StandardUnit.Count);
        metricUnitsMap.put("tier/replication/factor",StandardUnit.Count);
        metricUnitsMap.put("tier/required/capacity",StandardUnit.Bytes);
        metricUnitsMap.put("tier/total/capacity",StandardUnit.Bytes);

        // Kafka Indexing Service Metrics
        metricUnitsMap.put("ingest/events/thrownAway", StandardUnit.Count);
        metricUnitsMap.put("ingest/events/unparseable", StandardUnit.Count);
        metricUnitsMap.put("ingest/events/processed", StandardUnit.Count);
        metricUnitsMap.put("ingest/rows/output", StandardUnit.Count);
        metricUnitsMap.put("ingest/persists/count", StandardUnit.Count);
        metricUnitsMap.put("ingest/persists/time", StandardUnit.Milliseconds);
        metricUnitsMap.put("ingest/persists/backPressure", StandardUnit.Milliseconds);
        metricUnitsMap.put("ingest/persists/failed", StandardUnit.Count);
        metricUnitsMap.put("ingest/handoff/failed", StandardUnit.Count);
        metricUnitsMap.put("ingest/merge/time", StandardUnit.Milliseconds);
        metricUnitsMap.put("ingest/handoff/count", StandardUnit.Count);
        metricUnitsMap.put("ingest/sink/count", StandardUnit.Count);
        metricUnitsMap.put("ingest/events/messageGap", StandardUnit.Milliseconds);
        metricUnitsMap.put("ingest/kafka/lag", StandardUnit.Count);
        metricUnitsMap.put("task/run/time", StandardUnit.Milliseconds);
        metricUnitsMap.put("segment/added/bytes", StandardUnit.Bytes);
        metricUnitsMap.put("segment/moved/bytes", StandardUnit.Bytes);
        metricUnitsMap.put("segment/nuked/bytes", StandardUnit.Bytes);
        metricUnitsMap.put("task/success/count", StandardUnit.Count);
        metricUnitsMap.put("task/failed/count", StandardUnit.Count);
        metricUnitsMap.put("task/running/count", StandardUnit.Count);
        metricUnitsMap.put("task/pending/count", StandardUnit.Count);
        metricUnitsMap.put("task/waiting/count", StandardUnit.Count);
        metricUnitsMap.put("taskSlot/total/count", StandardUnit.Count);
        metricUnitsMap.put("taskSlot/idle/count", StandardUnit.Count);
        metricUnitsMap.put("taskSlot/used/count", StandardUnit.Count);
        metricUnitsMap.put("taskSlot/lazy/count", StandardUnit.Count);
        metricUnitsMap.put("taskSlot/blacklisted/count", StandardUnit.Count);

    }

    public boolean isWhiteListed(final String metricName) {
        return metricUnitsMap.keySet().contains(metricName);
    }

    public double getValue(final String metricName, final Number metricValue) {
        if (JVM_GC_CPU.equals(metricName)) {
            return TimeUnit.NANOSECONDS.toMillis(metricValue.longValue());
        }
        else {
            return metricValue.doubleValue();
        }
    }

    public StandardUnit getUnit(final String metricName) {

        if (metricUnitsMap.containsKey(metricName)) {
            return metricUnitsMap.get(metricName);
        }
        else {
            return StandardUnit.Count;
        }
    }
}

