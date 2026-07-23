import {
    mergeEndpointPerformanceHistogram,
    type FixedHistogram,
} from "../../../core/rollups/endpoint-performance/histogram";
import type {
    EndpointPerformanceAggregate,
    EndpointPerformanceBatch,
    EndpointPerformanceCollectorAggregate,
    EndpointPerformanceCounterAggregate,
    EndpointPerformanceStageAggregate,
} from "../../../core/rollups/endpoint-performance/types";

export function mergeEndpointPerformanceBatch(
    rollups: Map<string, EndpointPerformanceAggregate>,
    collectors: Map<string, EndpointPerformanceCollectorAggregate>,
    batch: EndpointPerformanceBatch,
): void {
    for (const aggregate of batch.rollups) {
        const key = rollupKey(aggregate);
        const current = rollups.get(key);
        rollups.set(key, current ? mergeRollup(current, aggregate) : cloneRollup(aggregate));
    }
    for (const collector of batch.collectors) {
        const key = collectorKey(collector);
        const current = collectors.get(key);
        collectors.set(key, current ? mergeCollector(current, collector) : cloneCollector(collector));
    }
}

function mergeRollup(
    current: EndpointPerformanceAggregate,
    incoming: EndpointPerformanceAggregate,
): EndpointPerformanceAggregate {
    current.requestCount += incoming.requestCount;
    current.errorCount += incoming.errorCount;
    current.firstObservedAt =
        incoming.firstObservedAt < current.firstObservedAt
            ? new Date(incoming.firstObservedAt)
            : current.firstObservedAt;
    current.lastObservedAt =
        incoming.lastObservedAt > current.lastObservedAt ? new Date(incoming.lastObservedAt) : current.lastObservedAt;
    for (const [stage, aggregate] of Object.entries(incoming.stages)) {
        if (aggregate) {
            current.stages[stage as keyof typeof current.stages] = mergeStage(
                current.stages[stage as keyof typeof current.stages],
                aggregate,
            );
        }
    }
    for (const [stage, aggregate] of Object.entries(incoming.counters)) {
        if (aggregate) {
            current.counters[stage as keyof typeof current.counters] = mergeCounter(
                current.counters[stage as keyof typeof current.counters],
                aggregate,
            );
        }
    }
    return current;
}

function mergeStage(
    current: EndpointPerformanceStageAggregate | undefined,
    incoming: EndpointPerformanceStageAggregate,
): EndpointPerformanceStageAggregate {
    if (!current) {
        return cloneStage(incoming);
    }
    current.count += incoming.count;
    current.sumMs += incoming.sumMs;
    current.maxMs = Math.max(current.maxMs, incoming.maxMs);
    mergeEndpointPerformanceHistogram(current.histogram, incoming.histogram);
    return current;
}

function mergeCounter(
    current: EndpointPerformanceCounterAggregate | undefined,
    incoming: EndpointPerformanceCounterAggregate,
): EndpointPerformanceCounterAggregate {
    return current
        ? {
              observations: current.observations + incoming.observations,
              sum: current.sum + incoming.sum,
              max: Math.max(current.max, incoming.max),
          }
        : { ...incoming };
}

function mergeCollector(
    current: EndpointPerformanceCollectorAggregate,
    incoming: EndpointPerformanceCollectorAggregate,
): EndpointPerformanceCollectorAggregate {
    current.accepted = Math.max(current.accepted, incoming.accepted);
    current.dropped = Math.max(current.dropped, incoming.dropped);
    current.invalid = Math.max(current.invalid, incoming.invalid);
    current.flushFailures = Math.max(current.flushFailures, incoming.flushFailures);
    current.uncertain ||= incoming.uncertain;
    current.lastFlushAt =
        incoming.lastFlushAt > current.lastFlushAt ? new Date(incoming.lastFlushAt) : current.lastFlushAt;
    return current;
}

function cloneRollup(aggregate: EndpointPerformanceAggregate): EndpointPerformanceAggregate {
    return {
        ...aggregate,
        bucket: new Date(aggregate.bucket),
        firstObservedAt: new Date(aggregate.firstObservedAt),
        lastObservedAt: new Date(aggregate.lastObservedAt),
        stages: Object.fromEntries(
            Object.entries(aggregate.stages).map(([stage, value]) => [stage, value ? cloneStage(value) : value]),
        ),
        counters: Object.fromEntries(
            Object.entries(aggregate.counters).map(([stage, value]) => [stage, value ? { ...value } : value]),
        ),
    };
}

function cloneStage(aggregate: EndpointPerformanceStageAggregate): EndpointPerformanceStageAggregate {
    return { ...aggregate, histogram: [...aggregate.histogram] as FixedHistogram };
}

function cloneCollector(collector: EndpointPerformanceCollectorAggregate): EndpointPerformanceCollectorAggregate {
    return { ...collector, bucket: new Date(collector.bucket), lastFlushAt: new Date(collector.lastFlushAt) };
}

function rollupKey(aggregate: EndpointPerformanceAggregate): string {
    return JSON.stringify([
        aggregate.bucket.toISOString(),
        aggregate.surface,
        aggregate.endpointUrn,
        aggregate.method,
        aggregate.statusClass,
    ]);
}

function collectorKey(collector: EndpointPerformanceCollectorAggregate): string {
    return JSON.stringify([collector.collectorId, collector.bucket.toISOString()]);
}
