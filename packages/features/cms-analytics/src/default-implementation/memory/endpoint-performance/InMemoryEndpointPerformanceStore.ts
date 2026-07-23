import {
    ENDPOINT_PERFORMANCE_BUCKET_MS,
    ENDPOINT_PERFORMANCE_RETENTION_DAYS,
} from "../../../core/rollups/endpoint-performance/normalization";
import type {
    EndpointPerformanceAggregate,
    EndpointPerformanceBatchWriter,
    EndpointPerformanceCollectorAggregate,
} from "../../../core/rollups/endpoint-performance/types";
import type { EndpointPerformanceQuery, EndpointPerformanceReports } from "../../../interfaces/EndpointPerformance";
import { mergeEndpointPerformanceBatch } from "./merge";
import { projectEndpointPerformanceDashboard } from "./projectDashboard";

export type InMemoryEndpointPerformanceStoreConfig = {
    now?: () => Date;
};

/**
 * Ephemeral endpoint rollups for local runtimes and tests. Production
 * composition uses the Mongo adapter for durable multi-instance merges.
 */
export class InMemoryEndpointPerformanceStore implements EndpointPerformanceBatchWriter, EndpointPerformanceReports {
    private readonly rollups = new Map<string, EndpointPerformanceAggregate>();
    private readonly collectors = new Map<string, EndpointPerformanceCollectorAggregate>();
    private readonly now: () => Date;

    constructor(config: InMemoryEndpointPerformanceStoreConfig = {}) {
        this.now = config.now ?? (() => new Date());
    }

    async write(batch: Parameters<EndpointPerformanceBatchWriter["write"]>[0]): Promise<void> {
        const now = this.safeNow();
        mergeEndpointPerformanceBatch(this.rollups, this.collectors, batch);
        this.prune(now);
    }

    async dashboard(query: EndpointPerformanceQuery, now = this.safeNow()) {
        this.prune(this.safeNow());
        return projectEndpointPerformanceDashboard(
            [...this.rollups.values()],
            [...this.collectors.values()],
            query,
            new Date(now),
        );
    }

    private prune(now: Date): void {
        const oldest =
            now.getTime() - ENDPOINT_PERFORMANCE_RETENTION_DAYS * 86_400_000 - ENDPOINT_PERFORMANCE_BUCKET_MS;
        for (const [key, aggregate] of this.rollups) {
            if (aggregate.bucket.getTime() < oldest) {
                this.rollups.delete(key);
            }
        }
        for (const [key, collector] of this.collectors) {
            if (collector.bucket.getTime() < oldest) {
                this.collectors.delete(key);
            }
        }
    }

    private safeNow(): Date {
        try {
            const value = this.now();
            return value instanceof Date && Number.isFinite(value.getTime()) ? new Date(value) : new Date();
        } catch {
            return new Date();
        }
    }
}
