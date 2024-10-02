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

import com.amazonaws.services.cloudwatch.model.Dimension;
import com.amazonaws.services.cloudwatch.model.MetricDatum;
import com.amazonaws.services.cloudwatch.model.StandardUnit;
import org.apache.druid.java.util.emitter.service.AlertEvent;
import org.apache.druid.java.util.emitter.service.ServiceMetricEvent;
import org.joda.time.DateTime;
import org.joda.time.DateTimeZone;

import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.concurrent.atomic.AtomicLong;
import java.util.stream.Collectors;

public class DruidMonitoringMetricsFactory {

    private static final String DRUID_DIMENSION_GC_SPACE_NAME = "gcGenSpaceName";

    private static final String DRUID_DIMENSION_HAS_FILTERS = "hasFilters";

    private static final String DRUID_DIMENSION_REMOTE_ADDRESS = "remoteAddress";

    private static final String DRUID_DIMENSION_NUM_DIMENSIONS = "numDimensions";

    private static final String DRUID_DIMENSION_THRESHOLD = "threshold";

    private static final String DRUID_DIMENSION_DIMENSION = "dimension";

    private static final String DRUID_DIMENSION_NUM_COMPLEX_METRICS = "numComplexMetrics";

    private static final String DRUID_DIMENSION_NUM_METRICS = "numMetrics";

    private static final String DRUID_DIMENSION_ID = "id";

    private static final String DRUID_DIMENSION_INTERVAL = "interval";

    private static final String DRUID_DIMENSION_CONTEXT = "context";

    private static final String DRUID_DIMENSION_DURATION = "duration";

    private static final String DRUID_DIMENSION_TASKID = "taskId";

    private static final String DRUID_DIMENSION_SEGMENT = "segment";

    private static final String DRUID_ALERT_METRIC_NAME = "Druid.Alert";

    private static final String DRUID_SERVICE_DIMENSION_NAME = "Druid.Service";

    private static final String DRUID_CLUSTER_DIMENSION_NAME = "Druid.Cluster";

    private static final String CLOUDWATCH_EXTENSION_METRIC_LOST_METRIC_NAME = "CloudwatchExtension.MetricLost";

    private static final String CLOUDWATCH_EXTENSION_INVALID_LOST_METRIC_NAME = "CloudwatchExtension.InvalidLost";

    private static final String CLOUDWATCH_EXTENSION_ALERT_LOST_METRIC_NAME = "CloudwatchExtension.AlertLost";

    private static final String CLOUDWATCH_EXTENSION_FATAL_METRIC_NAME = "CloudwatchExtension.Fatal";

    private final CloudwatchMetricUnits cloudwatchMetricUnits;

    private final List<String> dimensionBlacklist;

    private final CloudwatchEmitterConfig config;

    public DruidMonitoringMetricsFactory(CloudwatchEmitterConfig config) {
        this.config = config;
        this.cloudwatchMetricUnits = new CloudwatchMetricUnits();
        dimensionBlacklist = new ArrayList<>();
        fillBlacklistedDimensions();
    }

    private void fillBlacklistedDimensions() {
        dimensionBlacklist.add(DRUID_DIMENSION_GC_SPACE_NAME);
        dimensionBlacklist.add(DRUID_DIMENSION_CONTEXT);
        dimensionBlacklist.add(DRUID_DIMENSION_DIMENSION);
        dimensionBlacklist.add(DRUID_DIMENSION_DURATION);
        dimensionBlacklist.add(DRUID_DIMENSION_HAS_FILTERS);
        dimensionBlacklist.add(DRUID_DIMENSION_ID);
        dimensionBlacklist.add(DRUID_DIMENSION_INTERVAL);
        dimensionBlacklist.add(DRUID_DIMENSION_NUM_COMPLEX_METRICS);
        dimensionBlacklist.add(DRUID_DIMENSION_NUM_DIMENSIONS);
        dimensionBlacklist.add(DRUID_DIMENSION_NUM_METRICS);
        dimensionBlacklist.add(DRUID_DIMENSION_REMOTE_ADDRESS);
        dimensionBlacklist.add(DRUID_DIMENSION_THRESHOLD);
        dimensionBlacklist.add(DRUID_DIMENSION_TASKID);
        dimensionBlacklist.add(DRUID_DIMENSION_SEGMENT);
    }

    public static String scrubDimensionString(String s) {
        s = s.replaceAll("[\\[\\]\\s]", "");
        s = s.replace(":", "-");
        return s;
    }

    List<Dimension> getDimensions(final Map<String, Object> eventDims) {
        return eventDims.entrySet().stream()
            .filter(entry -> !dimensionBlacklist.contains(entry.getKey()))
            .map(entry -> {
                String dimensionVal;
                if (entry.getValue() instanceof List) {
                    List<Object> dimensionVals = (List<Object>) entry.getValue();
                    if (dimensionVals.size() == 1 && dimensionVals.get(0) instanceof String) {
                        dimensionVal = (String) dimensionVals.get(0);
                    } else {
                        return null;
                    }
                } else if (entry.getValue() instanceof String) {
                    dimensionVal = (String) entry.getValue();
                } else {
                    return null;
                }

                dimensionVal = scrubDimensionString(dimensionVal).trim();
                return dimensionVal.length() > 0 ? new Dimension().withName(entry.getKey()).withValue(dimensionVal) : null;
            })
            .filter(Objects::nonNull)
            .collect(Collectors.toList());
    }

    private List<Dimension> getDimensions(final ServiceMetricEvent serviceMetricEvent) {
        final List<Dimension> dimensions = new ArrayList<>();
        dimensions.add(new Dimension().withName(DRUID_SERVICE_DIMENSION_NAME).withValue(serviceMetricEvent.getService()));
        dimensions.add(new Dimension().withName(DRUID_CLUSTER_DIMENSION_NAME).withValue(config.getClusterName()));
        dimensions.addAll(getDimensions(serviceMetricEvent.getUserDims()));

        return dimensions;
    }

    private List<Dimension> getDimensions(final AlertEvent alertEvent) {
        final List<Dimension> dimensions = new ArrayList<>();
        dimensions.add(new Dimension().withName(DRUID_SERVICE_DIMENSION_NAME).withValue(alertEvent.getService()));
        dimensions.add(new Dimension().withName(DRUID_CLUSTER_DIMENSION_NAME).withValue(config.getClusterName()));

        return dimensions;
    }

    public MetricDatum createCloudwatchMetric(final ServiceMetricEvent druidMetricEvent) {
        if (cloudwatchMetricUnits.isWhiteListed(druidMetricEvent.getMetric())) {
            return new MetricDatum()
                    .withMetricName(druidMetricEvent.getMetric())
                    .withValue(cloudwatchMetricUnits.getValue(druidMetricEvent.getMetric(), druidMetricEvent.getValue().doubleValue()))
                    .withDimensions(getDimensions(druidMetricEvent))
                    .withUnit(cloudwatchMetricUnits.getUnit(druidMetricEvent.getMetric()))
                    .withTimestamp(druidMetricEvent.getCreatedTime().toDate());
        }
        else {
            return null;
        }
    }

    public MetricDatum createCloudwatchMetric(final AlertEvent druidAlertEvent) {
        return new MetricDatum()
                .withMetricName(DRUID_ALERT_METRIC_NAME)
                .withValue(1.0)
                .withDimensions(getDimensions(druidAlertEvent))
                .withUnit(StandardUnit.Count)
                .withTimestamp(druidAlertEvent.getCreatedTime().toDate());
    }

    private MetricDatum createMetricDatumFromCount(final String metricName, final AtomicLong count) {
        return new MetricDatum()
                .withMetricName(metricName)
                .withTimestamp(DateTime.now(DateTimeZone.UTC).toDate())
                .withUnit(StandardUnit.Count)
                .withValue((double) count.getAndSet(0L));
    }

    public List<MetricDatum> createMetricDatumsFromCounts(final AtomicLong metricLost, final AtomicLong invalidLost,
                                                          final AtomicLong alertLost, final AtomicLong fatalCount) {
        final List<MetricDatum> metricDatums = new ArrayList<>();
        metricDatums.add(createMetricDatumFromCount(CLOUDWATCH_EXTENSION_METRIC_LOST_METRIC_NAME, metricLost));
        metricDatums.add(createMetricDatumFromCount(CLOUDWATCH_EXTENSION_INVALID_LOST_METRIC_NAME, invalidLost));
        metricDatums.add(createMetricDatumFromCount(CLOUDWATCH_EXTENSION_ALERT_LOST_METRIC_NAME, alertLost));
        metricDatums.add(createMetricDatumFromCount(CLOUDWATCH_EXTENSION_FATAL_METRIC_NAME, fatalCount));

        return metricDatums;
    }
}
