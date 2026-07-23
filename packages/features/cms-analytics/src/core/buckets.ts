/**
 * Time-bucket helpers for the write-time counter model. Pure, zero dependencies.
 * Everything is UTC: page-view rollups are truncated to the hour, the unique-visitor
 * dedup keys by the UTC day. The `_id` strings are deterministic so writes upsert.
 */

/** Start of the UTC hour containing `d` (minutes/seconds/ms zeroed). */
export function truncateToHour(d: Date): Date {
    return new Date(Math.floor(d.getTime() / 3_600_000) * 3_600_000);
}

/** Start of the UTC day containing `d`. */
export function truncateToDay(d: Date): Date {
    return new Date(Math.floor(d.getTime() / 86_400_000) * 86_400_000);
}

/** UTC hour key, e.g. "2026-06-02T14". */
export function hourKey(d: Date): string {
    return d.toISOString().slice(0, 13);
}

/** UTC day key, e.g. "2026-06-02". */
export function dayKey(d: Date): string {
    return d.toISOString().slice(0, 10);
}

/** Deterministic rollup _id: "metric|dim|key|timeKey" (e.g. "pv|path|/about|2026-06-02T14"). */
export function rollupId(metric: string, dim: string, key: string, timeKey: string): string {
    return `${metric}|${dim}|${encodeURIComponent(key)}|${timeKey}`;
}

export function fillTimeBuckets(rows: TimeBucket[], query: RangeQuery): TimeBucket[] {
    const byTime = new Map(rows.map((row) => [row.bucket.getTime(), row]));
    const output: TimeBucket[] = [];
    const step = query.interval === "day" ? 86_400_000 : 3_600_000;
    for (let time = query.from.getTime(); time < query.to.getTime(); time += step) {
        output.push(byTime.get(time) ?? { bucket: new Date(time), count: 0, avgMs: 0, maxMs: 0 });
    }
    return output;
}

export function dayBucketCount(from: Date, to: Date): number {
    const start = truncateToDay(from).getTime();
    let count = 0;
    for (let time = start; time < to.getTime(); time += 86_400_000) {
        count++;
    }
    return count;
}

export function parseFlowKey(key: string): { from: string; to: string } | null {
    try {
        const parsed = JSON.parse(key);
        if (!Array.isArray(parsed) || parsed.length !== 2) {
            return null;
        }
        const [from, to] = parsed;
        return typeof from === "string" && typeof to === "string" ? { from, to } : null;
    } catch {
        const separator = key.indexOf(">");
        return separator > 0 ? { from: key.slice(0, separator), to: key.slice(separator + 1) } : null;
    }
}
import type { RangeQuery, TimeBucket } from "../interfaces/AnalyticsStore";
