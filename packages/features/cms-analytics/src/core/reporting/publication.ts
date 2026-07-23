import { OTHER_REFERRERS } from "../referrers/FrequentItems";
import { STRICT_ANALYTICS_LIMITS } from "../../interfaces/AnalyticsPrivacy";
import type { FlowCount, KeyCount, TimeBucket } from "../../interfaces/AnalyticsStore";

const THRESHOLD = STRICT_ANALYTICS_LIMITS.publicationThreshold;
const ROUNDING = 10;

export type Published<T> = { data: T; suppressed: number };

export function publishCount(value: number): Published<number> {
    if (value === 0) {
        return { data: 0, suppressed: 0 };
    }
    if (value < THRESHOLD) {
        return { data: 0, suppressed: 1 };
    }
    return { data: roundCount(value), suppressed: 0 };
}

export function publishKeyCounts(rows: KeyCount[], limit: number, groupOther = true): Published<KeyCount[]> {
    const visible = rows.filter((row) => row.count >= THRESHOLD);
    const hidden = rows.filter((row) => row.count > 0 && row.count < THRESHOLD);
    const result = visible.map((row) => ({ ...row, count: roundCount(row.count) }));
    const hiddenTotal = hidden.reduce((sum, row) => sum + row.count, 0);
    if (groupOther && hiddenTotal >= THRESHOLD) {
        const existing = result.find((row) => row.key === OTHER_REFERRERS);
        if (existing) {
            existing.count = roundCount(existing.count + hiddenTotal);
        } else {
            result.push({ key: OTHER_REFERRERS, count: roundCount(hiddenTotal) });
        }
    }
    result.sort((left, right) => right.count - left.count);
    return { data: limit > 0 ? result.slice(0, limit) : result, suppressed: hidden.length };
}

export function publishFlows(rows: FlowCount[], limit: number): Published<FlowCount[]> {
    const visible = rows
        .filter((row) => row.count >= THRESHOLD)
        .map((row) => ({ ...row, count: roundCount(row.count) }))
        .slice(0, limit);
    return { data: visible, suppressed: rows.filter((row) => row.count > 0 && row.count < THRESHOLD).length };
}

export function publishTimeseries(rows: TimeBucket[]): Published<TimeBucket[]> {
    let suppressed = 0;
    const data = rows.map((row) => {
        if (row.count === 0) {
            return { ...row, count: 0, avgMs: undefined, maxMs: undefined };
        }
        if (row.count < THRESHOLD) {
            suppressed++;
            return { bucket: row.bucket, count: 0 };
        }
        return {
            bucket: row.bucket,
            count: roundCount(row.count),
            avgMs: row.avgMs === undefined ? undefined : roundCount(row.avgMs),
            maxMs: row.maxMs === undefined ? undefined : roundCount(row.maxMs),
        };
    });
    return { data, suppressed };
}

export function roundCount(value: number): number {
    return Math.round(value / ROUNDING) * ROUNDING;
}

export const PUBLICATION_ROUNDING = ROUNDING;
