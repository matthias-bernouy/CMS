import type {
    EndpointPerformanceObservation,
    EndpointPerformanceRecorder,
} from "../../../interfaces/EndpointPerformance";
import {
    appendEndpointPerformanceObservation,
    createEndpointPerformanceAggregate,
    endpointPerformanceAggregateKey,
} from "./aggregate";
import { EndpointPerformanceCollectorTracker, endpointPerformanceCollectorId } from "./collector";
import { normalizeEndpointPerformanceObservation } from "./normalization";
import type { EndpointPerformanceAggregate, EndpointPerformanceBatch, EndpointPerformanceBatchWriter } from "./types";

export type BufferedEndpointPerformanceRecorderConfig = {
    enabled?: boolean;
    maxSeries?: number;
    /** Unique for this process lifetime; invalid or missing values are replaced with a random identifier. */
    collectorId?: string;
    now?: () => Date;
};

export type BufferedEndpointPerformanceStats = {
    bufferedSeries: number;
    accepted: number;
    dropped: number;
    invalid: number;
    flushFailures: number;
};

export class BufferedEndpointPerformanceRecorder implements EndpointPerformanceRecorder {
    private rollups = new Map<string, EndpointPerformanceAggregate>();
    private inFlight: Promise<void> | null = null;
    private additionalFlushRequested = false;
    private readonly enabled: boolean;
    private readonly maxSeries: number;
    private readonly now: () => Date;
    private readonly collector: EndpointPerformanceCollectorTracker;
    private totals = { accepted: 0, dropped: 0, invalid: 0, flushFailures: 0 };

    constructor(
        private readonly writer: EndpointPerformanceBatchWriter,
        config: BufferedEndpointPerformanceRecorderConfig = {},
    ) {
        this.enabled = config.enabled ?? true;
        this.maxSeries = validCapacity(config.maxSeries);
        this.now = config.now ?? (() => new Date());
        this.collector = new EndpointPerformanceCollectorTracker(endpointPerformanceCollectorId(config.collectorId));
    }

    observe(observation: EndpointPerformanceObservation): void {
        if (!this.enabled) {
            return;
        }
        const now = this.safeNow();
        try {
            const normalized = normalizeEndpointPerformanceObservation(observation, now);
            if (!normalized) {
                this.noteDrop(now, true);
                return;
            }
            const key = endpointPerformanceAggregateKey(normalized);
            let aggregate = this.rollups.get(key);
            if (!aggregate) {
                if (this.rollups.size >= this.maxSeries) {
                    this.noteDrop(normalized.ts, false);
                    return;
                }
                aggregate = createEndpointPerformanceAggregate(normalized);
                this.rollups.set(key, aggregate);
            }
            appendEndpointPerformanceObservation(aggregate, normalized);
            this.collector.note(normalized.ts, { accepted: 1 });
            this.totals.accepted++;
        } catch {
            this.noteDrop(now, true);
        }
    }

    flush(): Promise<void> {
        if (!this.enabled) {
            return Promise.resolve();
        }
        if (this.inFlight) {
            this.additionalFlushRequested = true;
            return this.inFlight;
        }
        const operation = this.flushUntilSettled();
        this.inFlight = operation.finally(() => {
            this.inFlight = null;
        });
        return this.inFlight;
    }

    stats(): BufferedEndpointPerformanceStats {
        return { bufferedSeries: this.rollups.size, ...this.totals };
    }

    private async flushUntilSettled(): Promise<void> {
        do {
            this.additionalFlushRequested = false;
            await this.flushOnce();
        } while (this.additionalFlushRequested);
    }

    private async flushOnce(): Promise<void> {
        this.collector.heartbeat(this.safeNow());
        const batch = this.drain();
        const lost = batch.rollups.reduce((sum, aggregate) => sum + aggregate.requestCount, 0);
        await this.writer.write(batch).catch((error) => {
            this.collector.retry(batch.collectors);
            const now = this.safeNow();
            this.collector.note(now, { dropped: lost, flushFailures: 1, uncertain: true });
            this.totals.dropped += lost;
            this.totals.flushFailures++;
            throw error;
        });
    }

    private drain(): EndpointPerformanceBatch {
        const flushAt = this.safeNow();
        const batch = {
            rollups: [...this.rollups.values()],
            collectors: this.collector.snapshots(flushAt),
        };
        this.rollups = new Map();
        return batch;
    }

    private noteDrop(ts: Date, invalid: boolean): void {
        this.collector.note(ts, { dropped: 1, ...(invalid ? { invalid: 1 } : {}) });
        this.totals.dropped++;
        this.totals.invalid += invalid ? 1 : 0;
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

function validCapacity(value: number | undefined): number {
    return Number.isSafeInteger(value) && value! > 0 && value! <= 100_000 ? value! : 4_096;
}
