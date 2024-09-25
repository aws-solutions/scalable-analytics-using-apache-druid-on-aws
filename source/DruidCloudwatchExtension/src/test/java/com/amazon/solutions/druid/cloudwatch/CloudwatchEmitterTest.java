/* 
 Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 SPDX-License-Identifier: Apache-2.0
*/
package com.amazon.solutions.druid.cloudwatch;

import com.amazon.solutions.druid.cloudwatch.MemoryBoundLinkedBlockingQueue.ObjectContainer;
import com.amazonaws.services.cloudwatch.AmazonCloudWatch;
import com.amazonaws.services.cloudwatch.model.Dimension;
import com.amazonaws.services.cloudwatch.model.MetricDatum;
import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.apache.druid.java.util.emitter.service.AlertEvent;
import org.apache.druid.java.util.emitter.service.ServiceMetricEvent;
import org.junit.Before;
import org.junit.Test;
import org.mockito.ArgumentCaptor;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.MockitoAnnotations;
import org.mockito.Spy;

import java.util.ArrayList;
import java.util.List;
import java.util.concurrent.ScheduledExecutorService;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicLong;
import com.amazonaws.services.cloudwatch.model.PutMetricDataRequest;
import com.amazonaws.services.cloudwatch.model.StandardUnit;
import static org.junit.Assert.*;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyLong;
import static org.mockito.Mockito.*;

public class CloudwatchEmitterTest {

    @Mock
    private AmazonCloudWatch cloudWatchClient;

    @Mock
    private ObjectMapper jsonMapper;

    @Mock
    private DruidMonitoringMetricsFactory druidMonitoringMetricsFactory;

    @Spy
    private MemoryBoundLinkedBlockingQueue<MetricDatum> metricQueue =
            new MemoryBoundLinkedBlockingQueue<>(
                    CloudwatchEmitterConfig.CLOUDWATCH_METRICS_MEMORY_LIMIT);

    @Spy
    private MemoryBoundLinkedBlockingQueue<MetricDatum> alertQueue =
            new MemoryBoundLinkedBlockingQueue<>(
                    CloudwatchEmitterConfig.CLOUDWATCH_METRICS_MEMORY_LIMIT);

    @Mock
    private ScheduledExecutorService scheduler;

    @InjectMocks
    private CloudwatchEmitter emitter;

    @Before
    public void setUp() {
        MockitoAnnotations.openMocks(this);

        CloudwatchEmitterConfig config = new CloudwatchEmitterConfig("dev-cluster", 100, "v0.0.4");

        emitter = new CloudwatchEmitter(config, metricQueue, alertQueue, scheduler,
                druidMonitoringMetricsFactory, cloudWatchClient, jsonMapper);
    }

    @Test
    public void testStart() {
        emitter.start();
        verify(scheduler, times(2)).scheduleWithFixedDelay(any(), anyLong(), anyLong(),
                any(TimeUnit.class));
    }

    @Test
    public void testClose() {
        emitter.close();
        verify(scheduler, times(1)).shutdownNow();
    }

    @Test
    public void testSendMetricToCloudwatch() throws InterruptedException {
        MetricDatum eventMetricDatum = new MetricDatum();
        eventMetricDatum.setMetricName("event-metric");
        eventMetricDatum.setValue(1.0);
        eventMetricDatum.setUnit(StandardUnit.Count);
        
        Dimension dimensionEventMetric = new Dimension();
        dimensionEventMetric.setName("test-dimension");
        dimensionEventMetric.setValue("test-value");
        List<Dimension> dimensionsEventMetric = new ArrayList<>();
        dimensionsEventMetric.add(dimensionEventMetric);

        eventMetricDatum.setDimensions(
                dimensionsEventMetric
        );

        ObjectContainer<MetricDatum> eventMetricContainer =
                emitter.getObjectContainer(eventMetricDatum);
        metricQueue.offer(eventMetricContainer);

        MetricDatum alertMetricDatum = new MetricDatum();
        alertMetricDatum.setMetricName("alert-metric");
        alertMetricDatum.setValue(1.0);
        alertMetricDatum.setUnit(StandardUnit.Count);

        Dimension dimensionAlertMetric = new Dimension();
        dimensionAlertMetric.setName("test-dimension");
        dimensionAlertMetric.setValue("test-value");
        List<Dimension> dimensionsAlertMetric = new ArrayList<>();
        dimensionsAlertMetric.add(dimensionEventMetric);

        alertMetricDatum.setDimensions(
                dimensionsAlertMetric);
        ObjectContainer<MetricDatum> alertMetricContainer =
                emitter.getObjectContainer(alertMetricDatum);
        alertQueue.offer(alertMetricContainer);

        // Act
        emitter.sendMetricToCloudwatch();

        // Assert
        ArgumentCaptor<PutMetricDataRequest> putMetricCaptor =
                ArgumentCaptor.forClass(PutMetricDataRequest.class);
        verify(cloudWatchClient, times(2)).putMetricData(putMetricCaptor.capture());

        assertEquals(eventMetricDatum,
                putMetricCaptor.getAllValues().get(0).getMetricData().get(0));
        assertEquals(alertMetricDatum,
                putMetricCaptor.getAllValues().get(1).getMetricData().get(0));
    }

    @Test
    public void testEmit_withAlertEvent() throws JsonProcessingException {
        AlertEvent alertEvent = new AlertEvent("service1", "host1", "test alert");
        when(druidMonitoringMetricsFactory.createCloudwatchMetric(any(AlertEvent.class)))
                .thenReturn(new MetricDatum().withMetricName("Druid-Alert"));

        // Act
        emitter.emit(alertEvent);

        // Assert
        ArgumentCaptor<AlertEvent> eventCaptor = ArgumentCaptor.forClass(AlertEvent.class);
        verify(jsonMapper, times(1)).writeValueAsString(any(AlertEvent.class));
        verify(druidMonitoringMetricsFactory, times(1))
                .createCloudwatchMetric(eventCaptor.capture());
        assertEquals(eventCaptor.getValue(), alertEvent);
    }

    @Test
    public void testEmitFailure_withAlertEvent() throws JsonProcessingException {
        AlertEvent alertEvent = new AlertEvent("service1", "host1", "test alert");
        when(druidMonitoringMetricsFactory.createCloudwatchMetric(any(AlertEvent.class)))
                .thenReturn(new MetricDatum().withMetricName("Druid-Alert"));
        doReturn(false).when(alertQueue).offer(any());

        // Act
        emitter.emit(alertEvent);

        // Assert
        ArgumentCaptor<AlertEvent> eventCaptor = ArgumentCaptor.forClass(AlertEvent.class);
        verify(jsonMapper).writeValueAsString(any(AlertEvent.class));
        verify(druidMonitoringMetricsFactory).createCloudwatchMetric(eventCaptor.capture());
        assertEquals(eventCaptor.getValue(), alertEvent);

        // Test publish failure counts
        emitter.publishCountsToCloudwatch();

        // Verify
        ArgumentCaptor<PutMetricDataRequest> putMetricCaptor =
                ArgumentCaptor.forClass(PutMetricDataRequest.class);
        verify(cloudWatchClient).putMetricData(putMetricCaptor.capture());
        ArgumentCaptor<AtomicLong> alertLossCaptor = ArgumentCaptor.forClass(AtomicLong.class);
        verify(druidMonitoringMetricsFactory).createMetricDatumsFromCounts(any(AtomicLong.class),
                any(AtomicLong.class), alertLossCaptor.capture(), any(AtomicLong.class));

        // Assert
        assertEquals(1, alertLossCaptor.getValue().longValue());
    }

    @Test
    public void testEmit_withServiceMetricEvent() throws JsonProcessingException {
        ServiceMetricEvent.Builder metricEventBuilder = ServiceMetricEvent.builder();
        ServiceMetricEvent metricEvent = metricEventBuilder
                .setDimension("key1", "value1")
                .setDimension("key2", "value2")
                .build("task/success/count",  1)
                .build("some-service", "some-task");
        when(druidMonitoringMetricsFactory.createCloudwatchMetric(any(AlertEvent.class)))
                .thenReturn(new MetricDatum().withMetricName("Druid-Alert"));

        // Act
        emitter.emit(metricEvent);

        // Assert
        ArgumentCaptor<ServiceMetricEvent> eventCaptor = ArgumentCaptor.forClass(ServiceMetricEvent.class);
        verify(jsonMapper).writeValueAsString(any(ServiceMetricEvent.class));
        verify(druidMonitoringMetricsFactory)
                .createCloudwatchMetric(eventCaptor.capture());
        assertEquals(eventCaptor.getValue(), metricEvent);
    }

}
