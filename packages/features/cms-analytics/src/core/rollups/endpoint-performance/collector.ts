import {
    ENDPOINT_PERFORMANCE_BUCKET_MS,
    ENDPOINT_PERFORMANCE_RETENTION_DAYS,
    truncateEndpointPerformanceBucket,
} from "./normalization";
import type { EndpointPerformanceCollectorAggregate } from "./types";

type CollectorDelta = Partial<
    Pick<EndpointPerformanceCollectorAggregate, "accepted" | "dropped" | "invalid" | "flushFailures" | "uncertain">
>;

export class EndpointPerformanceCollectorTracker {
    private readonly totals = new Map<number, EndpointPerformanceCollectorAggregate>();
    private readonly dirty = new Set<number>();

    constructor(private readonly collectorId: string) {}

    note(ts: Date, delta: CollectorDelta): void {
        const aggregate = this.aggregateFor(ts);
        aggregate.accepted += delta.accepted ?? 0;
        aggregate.dropped += delta.dropped ?? 0;
        aggregate.invalid += delta.invalid ?? 0;
        aggregate.flushFailures += delta.flushFailures ?? 0;
        aggregate.uncertain ||= delta.uncertain ?? false;
        this.dirty.add(aggregate.bucket.getTime());
    }

    heartbeat(ts: Date): void {
        const aggregate = this.aggregateFor(ts);
        this.dirty.add(aggregate.bucket.getTime());
        this.prune(ts);
    }

    snapshots(flushAt: Date): EndpointPerformanceCollectorAggregate[] {
        const snapshots = [...this.dirty].flatMap((key) => {
            const aggregate = this.totals.get(key);
            if (!aggregate) {
                return [];
            }
            aggregate.lastFlushAt = flushAt;
            return [{ ...aggregate, bucket: new Date(aggregate.bucket), lastFlushAt: new Date(flushAt) }];
        });
        this.dirty.clear();
        return snapshots;
    }

    retry(snapshots: readonly EndpointPerformanceCollectorAggregate[]): void {
        for (const snapshot of snapshots) {
            if (snapshot.collectorId === this.collectorId && this.totals.has(snapshot.bucket.getTime())) {
                this.dirty.add(snapshot.bucket.getTime());
            }
        }
    }

    private aggregateFor(ts: Date): EndpointPerformanceCollectorAggregate {
        const bucket = truncateEndpointPerformanceBucket(ts);
        const key = bucket.getTime();
        const aggregate = this.totals.get(key) ?? {
            collectorId: this.collectorId,
            bucket,
            accepted: 0,
            dropped: 0,
            invalid: 0,
            flushFailures: 0,
            uncertain: false,
            lastFlushAt: ts,
        };
        this.totals.set(key, aggregate);
        return aggregate;
    }

    private prune(now: Date): void {
        const oldest =
            now.getTime() - ENDPOINT_PERFORMANCE_RETENTION_DAYS * 86_400_000 - ENDPOINT_PERFORMANCE_BUCKET_MS;
        for (const key of this.totals.keys()) {
            if (key < oldest) {
                this.totals.delete(key);
                this.dirty.delete(key);
            }
        }
    }
}

export function endpointPerformanceCollectorId(value?: string): string {
    return typeof value === "string" && /^[A-Za-z0-9_-]{1,64}$/.test(value) ? value : crypto.randomUUID();
}
