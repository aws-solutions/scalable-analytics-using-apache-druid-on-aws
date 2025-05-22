/* 
 Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 SPDX-License-Identifier: Apache-2.0
*/
package com.amazon.solutions.druid.cloudwatch;

import org.apache.druid.java.util.emitter.service.AlertEvent;
import org.apache.druid.java.util.emitter.service.ServiceMetricEvent;
import org.apache.druid.java.util.emitter.service.AlertEvent.Severity;
import org.joda.time.DateTime;
import org.junit.Before;
import org.junit.Test;
import java.util.Arrays;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.concurrent.atomic.AtomicLong;
import java.util.stream.Collectors;
import com.amazonaws.services.cloudwatch.model.Dimension;
import com.amazonaws.services.cloudwatch.model.MetricDatum;

import static org.junit.Assert.*;

public class DruidMonitoringMetricsFactoryTest {

    private DruidMonitoringMetricsFactory factory;

    @Before
    public void setUp() {
        CloudwatchEmitterConfig config = new CloudwatchEmitterConfig("dev-cluster", null, null);
        factory = new DruidMonitoringMetricsFactory(config);
    }

    @Test
    public void testScrubDimensionString() {
        String input = "[ hello world : ]";
        String output = DruidMonitoringMetricsFactory.scrubDimensionString(input);
        assertEquals("helloworld-", output);
    }

    @Test
    public void testGetDimensions_withBlockList() {
        Map<String, Object> eventDims = new HashMap<>();
        eventDims.put("id", "1234");
        eventDims.put("dimension", "[ some dimension : value ]");
        eventDims.put("numDimensions", 2);
        List<Dimension> dimensions = factory.getDimensions(eventDims);
        assertEquals(0, dimensions.size());
    }

    @Test
    public void testGetDimensions() {
        Map<String, Object> eventDims = new HashMap<>();
        eventDims.put("dataSource", "some: datasource");
        eventDims.put("eventType", "[some-event-type]");
        eventDims.put("Druid.Service", "some-druid-service");
        eventDims.put("list-dimensions", Arrays.asList("dimension1"));

        List<Dimension> dimensions = factory.getDimensions(eventDims);
        assertEquals(4, dimensions.size());

        Dimension dimension1 = new Dimension().withName("dataSource").withValue("some-datasource");
        assertTrue(dimensions.contains(dimension1));

        Dimension dimension2 = new Dimension().withName("eventType").withValue("some-event-type");
        assertTrue(dimensions.contains(dimension2));

        Dimension dimension3 = new Dimension().withName("Druid.Service").withValue("some-druid-service");
        assertTrue(dimensions.contains(dimension3));

        Dimension dimension4 = new Dimension().withName("list-dimensions").withValue("dimension1");
        assertTrue(dimensions.contains(dimension4));
    }

    @Test
    public void testCreateCloudwatchMetric_withServiceMetricEvent() {

        DruidMonitoringMetricsFactory factory = new DruidMonitoringMetricsFactory(new CloudwatchEmitterConfig("dev-cluster", null, null));

        DateTime metricCreateTime = DateTime.now();

        ServiceMetricEvent.Builder metricEventBuilder = ServiceMetricEvent.builder();
        ServiceMetricEvent metricEvent = metricEventBuilder
                .setDimension("key1", "value1")
                .setDimension("key2", "value2")
                .setMetric("task/success/count", 1)
                .setCreatedTime(metricCreateTime)
                .build("some-service", "some-task");
        
        // Act
        MetricDatum metricDatum = factory.createCloudwatchMetric(metricEvent);

        // Assert
        assertEquals("task/success/count", metricDatum.getMetricName());
        assertEquals(1.0, metricDatum.getValue(), 0.001);
        assertEquals(4, metricDatum.getDimensions().size());
        assertTrue(metricDatum.getDimensions().contains(new Dimension().withName("key1").withValue("value1")));
        assertTrue(metricDatum.getDimensions().contains(new Dimension().withName("key2").withValue("value2")));
        assertTrue(metricDatum.getDimensions().contains(new Dimension().withName("Druid.Service").withValue("some-service")));
        assertTrue(metricDatum.getDimensions().contains(new Dimension().withName("Druid.Cluster").withValue("dev-cluster")));

        assertEquals(metricCreateTime.toDate(), metricDatum.getTimestamp());
    }

    @Test
    public void testCreateCloudwatchMetric_withAlertEvent() {
        DruidMonitoringMetricsFactory factory = new DruidMonitoringMetricsFactory(new CloudwatchEmitterConfig("dev-cluster", null, null));
        DateTime metricCreateTime = DateTime.now();

        Map<String, Object> dataMap = new HashMap<>();
        dataMap.put("key1", "value1");
        AlertEvent alertEvent = new AlertEvent(metricCreateTime, "some-service", "some-host", Severity.ANOMALY, "alert test event", dataMap);
        
        // Act
        MetricDatum metricDatum = factory.createCloudwatchMetric(alertEvent);

        // Assert
        assertEquals("Druid.Alert", metricDatum.getMetricName());
        assertEquals(1.0, metricDatum.getValue(), 0.001);
        assertEquals(2, metricDatum.getDimensions().size());
        assertTrue(metricDatum.getDimensions().contains(new Dimension().withName("Druid.Service").withValue("some-service")));
        assertTrue(metricDatum.getDimensions().contains(new Dimension().withName("Druid.Cluster").withValue("dev-cluster")));
        assertEquals(metricCreateTime.toDate(), metricDatum.getTimestamp());
    }

    @Test
    public void testCreateMetricDatumsFromCounts() {

        DruidMonitoringMetricsFactory factory = new DruidMonitoringMetricsFactory(new CloudwatchEmitterConfig("dev-cluster", null, null));

        List<MetricDatum> metricDatumList = factory.createMetricDatumsFromCounts(new AtomicLong(1), new AtomicLong(2), new AtomicLong(3), new AtomicLong(4));
        List<String> metricNameList = metricDatumList.stream().map(MetricDatum::getMetricName).collect(Collectors.toList());

        // Assert
        assertEquals(4, metricDatumList.size());
        assertTrue(metricNameList.contains("CloudwatchExtension.MetricLost"));
        assertTrue(metricNameList.contains("CloudwatchExtension.InvalidLost"));
        assertTrue(metricNameList.contains("CloudwatchExtension.AlertLost"));
        assertTrue(metricNameList.contains("CloudwatchExtension.Fatal"));
    }

}
