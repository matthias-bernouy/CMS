import type { MetricDelta } from "../../interfaces/repositories/AccessMetricsRepository";

export type ParsedLineDelta = {
    bucketId: string;
    /** UTC day "YYYY-MM-DD" derived from `fulldate`. */
    day:      string;
    metric:   MetricDelta;
};

/**
 * Parse a JSON-Lines access-log row into a `(bucketId, day, delta)`
 * triple ready to be `$inc`-merged into the aggregate. Returns `null`
 * for malformed lines (truncated, missing fields, unparseable status)
 * — the caller skips them rather than aborting the whole file.
 *
 * `bucketId` defaults to `""` when nginx logged an empty value (port-80
 * redirects, ACME proxy passes, etc.) — those are still counted under
 * the unbucketed pseudo-row.
 */
export function parseJsonLineToDelta(line: string, _edgeId: string): ParsedLineDelta | null {
    let row: Record<string, unknown>;
    try {
        row = JSON.parse(line);
    } catch {
        return null;
    }
    const fulldate = typeof row.fulldate === "string" ? row.fulldate : null;
    if (!fulldate) return null;
    const day = fulldate.slice(0, 10); // YYYY-MM-DD
    if (day.length !== 10) return null;

    const status   = numFinite(row.status, 0);
    const bytes    = numFinite(row.bytes,  0);
    const bucketId = typeof row.bucket_id === "string" ? row.bucket_id : "";

    const bucket = statusBucket(status);
    const metric: MetricDelta = {
        requests:  1,
        bytes,
        status2xx: bucket === 2 ? 1 : 0,
        status3xx: bucket === 3 ? 1 : 0,
        status4xx: bucket === 4 ? 1 : 0,
        status5xx: bucket === 5 ? 1 : 0,
    };
    return { bucketId, day, metric };
}

function numFinite(v: unknown, fallback: number): number {
    const n = typeof v === "number" ? v : Number(v);
    return Number.isFinite(n) ? n : fallback;
}

function statusBucket(status: number): 2 | 3 | 4 | 5 | 0 {
    if (status >= 200 && status < 300) return 2;
    if (status >= 300 && status < 400) return 3;
    if (status >= 400 && status < 500) return 4;
    if (status >= 500 && status < 600) return 5;
    return 0;
}
