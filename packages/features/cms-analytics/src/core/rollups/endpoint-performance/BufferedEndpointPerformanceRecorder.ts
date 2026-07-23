import type {
    EndpointPerformanceObservation,
    EndpointPerformanceRecorder,
} from "../../../interfaces/EndpointPerformance";
import {
    appendEndpointPerformanceObservation,
    createEndpointPerformanceAggregate,
    endpointPerformanceAggregateKey,
} from "./aggregate";
import { normalizeEndpointPerformanceObservation, truncateEndpointPerformanceBucket } from "./normalization";
import type {
    EndpointPerformanceAggregate,
    EndpointPerformanceBatch,
    EndpointPerformanceBatchWriter,
    EndpointPerformanceCollectorAggregate,
} from "./types";

export type BufferedEndpointPerformanceRecorderConfig = {
    enabled?: boolean;
    maxSeries?: number;
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
    private collectors = new Map<number, EndpointPerformanceCollectorAggregate>();
    private inFlight: Promise<void> | null = null;
    private readonly enabled: boolean;
    private readonly maxSeries: number;
    private readonly now: () => Date;
    private totals = { accepted: 0, dropped: 0, invalid: 0, flushFailures: 0 };

    constructor(
        private readonly writer: EndpointPerformanceBatchWriter,
        config: BufferedEndpointPerformanceRecorderConfig = {},
    ) {
        this.enabled = config.enabled ?? true;
        this.maxSeries = validCapacity(config.maxSeries);
        this.now = config.now ?? (() => new Date());
    }

    observe(observation: EndpointPerformanceObservation): void {
        if (!this.enabled) {
            return;
        }
        try {
            const now = this.now();
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
            this.noteCollector(normalized.ts, { accepted: 1 });
            this.totals.accepted++;
        } catch {
            this.totals.dropped++;
            this.totals.invalid++;
        }
    }

    flush(): Promise<void> {
        if (this.inFlight) {
            return this.inFlight;
        }
        const batch = this.drain();
        if (batch.rollups.length === 0 && batch.collectors.length === 0) {
            return Promise.resolve();
        }
        const lost = batch.rollups.reduce((sum, aggregate) => sum + aggregate.requestCount, 0);
        const operation = this.writer.write(batch).catch((error) => {
            const now = this.now();
            this.noteCollector(now, { dropped: lost, flushFailures: 1 });
            this.totals.dropped += lost;
            this.totals.flushFailures++;
            throw error;
        });
        this.inFlight = operation.finally(() => {
            this.inFlight = null;
        });
        return this.inFlight;
    }

    stats(): BufferedEndpointPerformanceStats {
        return { bufferedSeries: this.rollups.size, ...this.totals };
    }

    private drain(): EndpointPerformanceBatch {
        const flushAt = this.now();
        const batch = {
            rollups: [...this.rollups.values()],
            collectors: [...this.collectors.values()].map((value) => ({ ...value, lastFlushAt: flushAt })),
        };
        this.rollups = new Map();
        this.collectors = new Map();
        return batch;
    }

    private noteDrop(ts: Date, invalid: boolean): void {
        this.noteCollector(ts, { dropped: 1, ...(invalid ? { invalid: 1 } : {}) });
        this.totals.dropped++;
        this.totals.invalid += invalid ? 1 : 0;
    }

    private noteCollector(
        ts: Date,
        delta: Partial<
            Pick<EndpointPerformanceCollectorAggregate, "accepted" | "dropped" | "invalid" | "flushFailures">
        >,
    ): void {
        const bucket = truncateEndpointPerformanceBucket(ts);
        const key = bucket.getTime();
        const current = this.collectors.get(key) ?? {
            bucket,
            accepted: 0,
            dropped: 0,
            invalid: 0,
            flushFailures: 0,
            lastFlushAt: ts,
        };
        current.accepted += delta.accepted ?? 0;
        current.dropped += delta.dropped ?? 0;
        current.invalid += delta.invalid ?? 0;
        current.flushFailures += delta.flushFailures ?? 0;
        this.collectors.set(key, current);
    }
}

function validCapacity(value: number | undefined): number {
    return Number.isSafeInteger(value) && value! > 0 && value! <= 100_000 ? value! : 4_096;
}
