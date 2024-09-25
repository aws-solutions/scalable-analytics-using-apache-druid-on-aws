/* 
 Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 SPDX-License-Identifier: Apache-2.0
*/
package com.amazon.solutions.druid.cloudwatch;

import com.amazonaws.ClientConfiguration;
import com.amazonaws.auth.DefaultAWSCredentialsProviderChain;
import com.amazonaws.regions.DefaultAwsRegionProviderChain;
import com.amazonaws.services.cloudwatch.AmazonCloudWatch;
import com.amazonaws.services.cloudwatch.AmazonCloudWatchClientBuilder;
import com.amazonaws.services.cloudwatch.model.MetricDatum;
import com.amazonaws.services.cloudwatch.model.PutMetricDataRequest;
import com.fasterxml.jackson.databind.ObjectMapper;
import lombok.AccessLevel;
import lombok.Getter;
import lombok.Setter;
import org.apache.druid.java.util.common.StringUtils;
import org.apache.druid.java.util.common.lifecycle.LifecycleStart;
import org.apache.druid.java.util.common.lifecycle.LifecycleStop;
import org.apache.druid.java.util.common.logger.Logger;
import org.apache.druid.java.util.emitter.core.Emitter;
import org.apache.druid.java.util.emitter.core.Event;
import org.apache.druid.java.util.emitter.service.AlertEvent;
import org.apache.druid.java.util.emitter.service.ServiceMetricEvent;
import java.util.List;
import java.util.concurrent.Executors;
import java.util.concurrent.ScheduledExecutorService;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicLong;
import java.util.stream.Collectors;

@Setter(AccessLevel.PACKAGE)
@Getter
public class CloudwatchEmitter implements Emitter {

    private static Logger logger = new Logger(CloudwatchEmitter.class);

    private static final String CLOUDWATCH_DRUID_METRICS_NAMESPACE = "AWSSolutions/Druid";

    private static final String CUSTOM_USER_AGENT_PREFIX = "AwsSolution/SO0262";

    private static final int SCHEDULER_INITIAL_DELAY = 10;

    private static final int SCHEDULER_DELAY = 10;

    private static final int SCHEDULER_THREAD_POOL_SIZE = 10;

    private static final int MAX_METRICS_PER_CLOUDWATCH_REQUEST = 100;

    private static final int SCHEDULER_INITIAL_DELAY_LOST_METRICS_IN_MINS = 1;

    private static final int SCHEDULER_DELAY_LOST_METRICS_IN_MINS = 1;

    private AtomicLong metricLost;

    private AtomicLong alertLost;

    private AtomicLong invalidLost;

    private AtomicLong fatalCount;

    private final ScheduledExecutorService scheduler;

    private final MemoryBoundLinkedBlockingQueue<MetricDatum> metricQueue;

    private final MemoryBoundLinkedBlockingQueue<MetricDatum> alertQueue;

    private final AmazonCloudWatch cloudWatchClient;

    private final ObjectMapper jsonMapper;

    // set to nosonar because it causes a false positive
    private final CloudwatchEmitterConfig config; // NOSONAR

    private final DruidMonitoringMetricsFactory druidMonitoringMetricsFactory;

    public CloudwatchEmitter(final CloudwatchEmitterConfig config, final ObjectMapper jsonMapper) {
        this(config,
             new MemoryBoundLinkedBlockingQueue<>(config.getBatchSize()),
             new MemoryBoundLinkedBlockingQueue<>(config.getBatchSize()),
             Executors.newScheduledThreadPool(SCHEDULER_THREAD_POOL_SIZE),
             new DruidMonitoringMetricsFactory(config),
             AmazonCloudWatchClientBuilder.standard()
                    .withCredentials(new DefaultAWSCredentialsProviderChain())
                    .withRegion(new DefaultAwsRegionProviderChain().getRegion())
                    .withClientConfiguration(new ClientConfiguration()
                        .withUserAgentPrefix(String.format("%s/%s", CUSTOM_USER_AGENT_PREFIX, config.getSolutionVersion())))
                    .build(),
             jsonMapper);
    }

    public CloudwatchEmitter(final CloudwatchEmitterConfig config, final MemoryBoundLinkedBlockingQueue<MetricDatum> metricQueue,
                             final MemoryBoundLinkedBlockingQueue<MetricDatum> alertQueue, final ScheduledExecutorService scheduler,
                             final DruidMonitoringMetricsFactory druidMonitoringMetricsFactory, final AmazonCloudWatch cloudWatchClient,
                             final ObjectMapper jsonMapper) {
        this.config = config;
        this.scheduler = scheduler;
        this.metricQueue = metricQueue;
        this.alertQueue = alertQueue;
        this.jsonMapper = jsonMapper;
        this.cloudWatchClient = cloudWatchClient;
        this.druidMonitoringMetricsFactory = druidMonitoringMetricsFactory;

        metricLost = new AtomicLong(0L);
        invalidLost = new AtomicLong(0L);
        alertLost = new AtomicLong(0L);
        fatalCount = new AtomicLong(0L);
    }

    @Override
    @LifecycleStart
    public void start() {
        scheduler.scheduleWithFixedDelay(this::sendMetricToCloudwatch, SCHEDULER_INITIAL_DELAY, SCHEDULER_DELAY, TimeUnit.SECONDS);
        scheduler.scheduleWithFixedDelay(this::publishCountsToCloudwatch, SCHEDULER_INITIAL_DELAY_LOST_METRICS_IN_MINS,
                SCHEDULER_DELAY_LOST_METRICS_IN_MINS, TimeUnit.MINUTES);
    }

    void publishCountsToCloudwatch() {
        try {
            final PutMetricDataRequest request = new PutMetricDataRequest();
            request.setMetricData(druidMonitoringMetricsFactory.createMetricDatumsFromCounts(metricLost, invalidLost, alertLost, fatalCount));
            request.setNamespace(CLOUDWATCH_DRUID_METRICS_NAMESPACE);
            cloudWatchClient.putMetricData(request);
        }
        catch (final Exception e) {
            logger.error(e, "Failed to send metrics to cloudwatch");
        }
    }

    void sendMetricToCloudwatch() {
        if (metricQueue.size() > 0) {
            sendToCloudwatch(metricQueue);
        }

        if (alertQueue.size() > 0) {
            sendToCloudwatch(alertQueue);
        }
    }

    private void sendToCloudwatch(final MemoryBoundLinkedBlockingQueue<MetricDatum> eventQueue) {
        try {
            List<MemoryBoundLinkedBlockingQueue.ObjectContainer<MetricDatum>> elements;
            for (elements = eventQueue.take(MAX_METRICS_PER_CLOUDWATCH_REQUEST);
                elements.size() > 0;
                elements = eventQueue.take(MAX_METRICS_PER_CLOUDWATCH_REQUEST)) {
                final List<MetricDatum> metrics = elements.stream().map(e -> e.getData()).collect(Collectors.toList());
                final PutMetricDataRequest request = new PutMetricDataRequest();
                request.setMetricData(metrics);
                request.setNamespace(CLOUDWATCH_DRUID_METRICS_NAMESPACE);
                logger.debug("Putting metrics data, the request is " + request.toString());
                cloudWatchClient.putMetricData(request);
            }
        }
        catch (final Exception e) {
            logger.error(e, "Failed to send metrics to cloudwatch");
        }
    }

    MemoryBoundLinkedBlockingQueue.ObjectContainer<MetricDatum> getObjectContainer(final MetricDatum metricDatum) {
        final int metricDatumLen = StringUtils.toUtf8(metricDatum.toString()).length;
        return new MemoryBoundLinkedBlockingQueue.ObjectContainer<>(
                metricDatum,
                metricDatumLen
        );
    }

    private void handleServiceMetricEvent(Event event) {
        final MetricDatum metricDatum =
                druidMonitoringMetricsFactory.createCloudwatchMetric((ServiceMetricEvent) event);
        if (metricDatum != null) {
            logger.debug("Cloudwatch metric datum for metric is " + metricDatum.toString());
            if (!metricQueue.offer(getObjectContainer(metricDatum))) {
                metricLost.incrementAndGet();
            }
        }
    }

    private void handleAlertEvent(Event event) {
        final MetricDatum metricDatum =
                druidMonitoringMetricsFactory.createCloudwatchMetric((AlertEvent) event);

        logger.debug("Cloudwatch metric datum for alert is " + metricDatum.toString());
        if (!alertQueue.offer(getObjectContainer(metricDatum))) {
            alertLost.incrementAndGet();
        }
    }

    @Override
    public void emit(final Event event) {
        if (event != null) {
            try {
                logger.debug("Emitting event " + jsonMapper.writeValueAsString(event));
                if (event instanceof ServiceMetricEvent) {
                    this.handleServiceMetricEvent(event);
                } else if (event instanceof AlertEvent) {
                    this.handleAlertEvent(event);
                } else {
                    invalidLost.incrementAndGet();
                }
            } catch (final Exception e) {
                fatalCount.incrementAndGet();
                logger.error(e, "Failed to emit cloudwatch event");
            } finally {
                logger.debug("Emitted an event, metric queue length is " + metricQueue.size());
            }
        }
    }

    @Override
    public void flush() {
        // do nothing for flush.
    }

    @Override
    @LifecycleStop
    public void close() {
        scheduler.shutdownNow();
    }
}