import { ENDPOINT_PERFORMANCE_BUCKET_MS } from "../../../core/rollups/endpoint-performance/normalization";
import type { EndpointPerformanceCollectorAggregate } from "../../../core/rollups/endpoint-performance/types";

export type EndpointPerformanceCollectorHealth = {
    accepted: number;
    dropped: number;
    invalid: number;
    flushFailures: number;
    uncertain: boolean;
    lastFlushAt: Date | null;
};

export function endpointPerformanceCollectorHealth(
    collectors: readonly EndpointPerformanceCollectorAggregate[],
    from: Date,
    now: Date,
): EndpointPerformanceCollectorHealth {
    const health: EndpointPerformanceCollectorHealth = {
        accepted: 0,
        dropped: 0,
        invalid: 0,
        flushFailures: 0,
        uncertain: false,
        lastFlushAt: null,
    };
    for (const collector of collectors) {
        if (collector.bucket < from || collector.bucket >= now) {
            continue;
        }
        health.accepted += collector.accepted;
        health.dropped += collector.dropped;
        health.invalid += collector.invalid;
        health.flushFailures += collector.flushFailures;
        health.uncertain ||= collector.uncertain;
        if (health.lastFlushAt === null || collector.lastFlushAt > health.lastFlushAt) {
            health.lastFlushAt = new Date(collector.lastFlushAt);
        }
    }
    return health;
}

export function endpointPerformanceIsStale(
    now: Date,
    lastObservationAt: Date | null,
    lastFlushAt: Date | null,
): boolean {
    const staleAfterMs = ENDPOINT_PERFORMANCE_BUCKET_MS * 2;
    return (
        lastFlushAt === null ||
        now.getTime() - lastFlushAt.getTime() > staleAfterMs ||
        (lastObservationAt !== null && now.getTime() - lastObservationAt.getTime() > staleAfterMs)
    );
}
