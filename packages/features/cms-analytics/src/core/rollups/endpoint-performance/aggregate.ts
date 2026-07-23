import type { EndpointTimingStage } from "../../../interfaces/EndpointPerformance";
import { addEndpointPerformanceDuration, emptyEndpointPerformanceHistogram } from "./histogram";
import { truncateEndpointPerformanceBucket, type NormalizedEndpointPerformanceObservation } from "./normalization";
import type { EndpointPerformanceAggregate, EndpointPerformanceStageAggregate } from "./types";

export function endpointPerformanceAggregateKey(observation: NormalizedEndpointPerformanceObservation): string {
    return JSON.stringify([
        truncateEndpointPerformanceBucket(observation.ts).toISOString(),
        observation.surface,
        observation.endpointUrn,
        observation.method,
        observation.statusClass,
    ]);
}

export function createEndpointPerformanceAggregate(
    observation: NormalizedEndpointPerformanceObservation,
): EndpointPerformanceAggregate {
    return {
        bucket: truncateEndpointPerformanceBucket(observation.ts),
        surface: observation.surface,
        endpointUrn: observation.endpointUrn,
        method: observation.method,
        statusClass: observation.statusClass,
        outcome: observation.outcome,
        requestCount: 0,
        errorCount: 0,
        firstObservedAt: observation.ts,
        lastObservedAt: observation.ts,
        stages: {},
    };
}

export function appendEndpointPerformanceObservation(
    aggregate: EndpointPerformanceAggregate,
    observation: NormalizedEndpointPerformanceObservation,
): void {
    aggregate.requestCount++;
    aggregate.errorCount += observation.statusClass === "4xx" || observation.statusClass === "5xx" ? 1 : 0;
    aggregate.firstObservedAt = observation.ts < aggregate.firstObservedAt ? observation.ts : aggregate.firstObservedAt;
    aggregate.lastObservedAt = observation.ts > aggregate.lastObservedAt ? observation.ts : aggregate.lastObservedAt;
    for (const [stage, duration] of Object.entries(observation.stagesMs) as Array<[EndpointTimingStage, number]>) {
        const current = aggregate.stages[stage] ?? emptyStageAggregate();
        current.count++;
        current.sumMs += duration;
        current.maxMs = Math.max(current.maxMs, duration);
        addEndpointPerformanceDuration(current.histogram, duration);
        aggregate.stages[stage] = current;
    }
}

function emptyStageAggregate(): EndpointPerformanceStageAggregate {
    return { count: 0, sumMs: 0, maxMs: 0, histogram: emptyEndpointPerformanceHistogram() };
}
