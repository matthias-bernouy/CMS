import type { LatencyHistogram } from "observability/cluster/interfaces/ClusterJournal";
import { ClusterLogsError } from "./errors";

export const HISTOGRAM_BASE = 1.1;
export const MAX_DURATION_MS = 86400000;
export function histogramIndex(duration: number): number {
    return duration < 1 ? 0 : Math.floor(Math.log(duration) / Math.log(HISTOGRAM_BASE)) + 1;
}
function quantile(row: LatencyHistogram, fraction: number): number {
    const rank = Math.ceil(row.count * fraction);
    let count = 0;
    for (const bin of [...row.bins].sort((a, b) => a.index - b.index)) {
        count += bin.count;
        if (count >= rank) {
            return Math.min(row.max, Math.max(row.min, bin.index === 0 ? 1 : HISTOGRAM_BASE ** bin.index));
        }
    }
    throw new Error("Invalid latency histogram");
}
export function mergeHistograms(rows: readonly LatencyHistogram[], from: string, to: string, interval: number) {
    const merged = new Map<string, LatencyHistogram>();
    for (const row of rows) {
        const id = JSON.stringify([row.bucket, row.key]);
        const previous = merged.get(id);
        if (!previous) {
            merged.set(id, row);
        } else {
            const bins = new Map(previous.bins.map((bin) => [bin.index, bin.count]));
            for (const bin of row.bins) {
                bins.set(bin.index, (bins.get(bin.index) ?? 0) + bin.count);
            }
            merged.set(id, {
                ...row,
                count: previous.count + row.count,
                sum: previous.sum + row.sum,
                min: Math.min(previous.min, row.min),
                max: Math.max(previous.max, row.max),
                bins: [...bins].map(([index, count]) => ({ index, count })),
            });
        }
        if (merged.size > 500) {
            throw new ClusterLogsError("QUERY_TOO_LARGE");
        }
    }
    return [...merged.values()]
        .sort((a, b) => a.bucket - b.bucket || a.key.localeCompare(b.key))
        .map((row) => ({
            from: new Date(Math.max(Date.parse(from), row.bucket * interval * 1000)).toISOString(),
            to: new Date(Math.min(Date.parse(to), (row.bucket + 1) * interval * 1000)).toISOString(),
            key: row.key,
            count: row.count,
            meanMs: row.sum / row.count,
            minMs: row.min,
            maxMs: row.max,
            p50Ms: quantile(row, 0.5),
            p95Ms: quantile(row, 0.95),
        }));
}
