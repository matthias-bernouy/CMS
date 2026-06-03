/**
 * Time-bucket helpers for the write-time counter model. Pure, zero dependencies.
 * Everything is UTC: page-view rollups are truncated to the hour, the unique-visitor
 * dedup keys by the UTC day. The `_id` strings are deterministic so writes upsert.
 */

/** Start of the UTC hour containing `d` (minutes/seconds/ms zeroed). PURE. */
export function truncateToHour(d: Date): Date {
    return new Date(Math.floor(d.getTime() / 3_600_000) * 3_600_000);
}

/** Start of the UTC day containing `d`. PURE. */
export function truncateToDay(d: Date): Date {
    return new Date(Math.floor(d.getTime() / 86_400_000) * 86_400_000);
}

/** UTC hour key, e.g. "2026-06-02T14". PURE. */
export function hourKey(d: Date): string {
    return d.toISOString().slice(0, 13);
}

/** UTC day key, e.g. "2026-06-02". PURE. */
export function dayKey(d: Date): string {
    return d.toISOString().slice(0, 10);
}

/** Deterministic rollup _id: "metric|dim|key|timeKey" (e.g. "pv|path|/about|2026-06-02T14"). PURE. */
export function rollupId(metric: string, dim: string, key: string, timeKey: string): string {
    return `${metric}|${dim}|${key}|${timeKey}`;
}

/** Dedup _id for the unique-visitor "seen" set: "visitorId|day". PURE. */
export function seenId(visitorId: string, day: string): string {
    return `${visitorId}|${day}`;
}
