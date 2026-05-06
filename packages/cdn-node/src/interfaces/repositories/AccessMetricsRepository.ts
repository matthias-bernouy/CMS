import type { AccessMetric, ProcessedLogFile } from "../entities/AccessMetric";

export type MetricDelta = {
    requests:  number;
    bytes:     number;
    status2xx: number;
    status3xx: number;
    status4xx: number;
    status5xx: number;
};

export type DateRange = {
    /** Inclusive, "YYYY-MM-DD". */
    from: string;
    /** Inclusive, "YYYY-MM-DD". */
    to:   string;
};

export type BucketBytes = { bucketId: string; bytes: number; requests: number };
export type EdgeBytes   = { edgeId:   string; bytes: number; requests: number };

export interface AccessMetricsRepository {

    /**
     * `$inc` the counters of the row keyed by `(edgeId, bucketId, day)`,
     * upserting it if absent. Idempotent in the sense that calling with
     * `{requests: 0, bytes: 0, …}` does nothing.
     */
    incrementMetric(
        key: { edgeId: string; bucketId: string; day: string },
        delta: MetricDelta,
    ): Promise<void>;

    /** Sum bytes + requests grouped by bucket, over a date range. */
    topBucketsByBytes(range: DateRange, limit: number): Promise<BucketBytes[]>;

    /** Sum bytes + requests grouped by edge, over a date range. */
    bytesByEdge(range: DateRange): Promise<EdgeBytes[]>;

    /** All rows in a date range, optionally filtered by edge. */
    listRange(range: DateRange, edgeId?: string): Promise<AccessMetric[]>;

    /** Was this file already folded into the aggregates? */
    isFileProcessed(edgeId: string, filename: string): Promise<boolean>;

    /** Mark a file as processed. Idempotent. */
    markFileProcessed(file: ProcessedLogFile): Promise<void>;
}
