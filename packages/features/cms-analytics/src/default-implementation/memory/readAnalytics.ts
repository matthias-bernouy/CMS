import type { RollupUpsert } from "../../core/rollups/eventToWrites";
import type {
    AnalyticsHealthSummary,
    AnalyticsSummary,
    FlowCount,
    KeyCount,
    RangeQuery,
    TimeBucket,
} from "../../interfaces/AnalyticsStore";
import {
    dayBucketCount,
    fillTimeBuckets,
    parseFlowKey,
    truncateToDay,
    truncateToHour,
} from "../../core/rollups/buckets";

type RollupRows = readonly RollupUpsert[];

export function readMemorySummary(rows: RollupRows, from: Date, to: Date): AnalyticsSummary {
    const content = selectRows(rows, "pv", "all", from, to);
    const views = sum(content, "count");
    const visitorDays = sum(selectRows(rows, "visitor", "estimate", from, to), "count");
    const health = readMemoryHealth(rows, from, to);
    return {
        views,
        uniqueVisitors: visitorDays,
        estimatedVisitors: visitorDays,
        visitorDays,
        averageDailyVisitors: average(visitorDays, dayBucketCount(from, to)),
        avgMs: views ? Math.round(sum(content, "msSum") / views) : 0,
        errorRate: health.requests ? (health.clientErrors + health.serverErrors) / health.requests : 0,
    };
}

export function readMemoryTimeseries(rows: RollupRows, query: RangeQuery): TimeBucket[] {
    const truncate = query.interval === "day" ? truncateToDay : truncateToHour;
    const totals = new Map<number, { count: number; msSum: number; maxMs: number }>();
    for (const row of selectRows(rows, "pv", "all", query.from, query.to)) {
        const time = truncate(row.bucket).getTime();
        const current = totals.get(time) ?? { count: 0, msSum: 0, maxMs: 0 };
        current.count += row.count;
        current.msSum += row.msSum ?? 0;
        current.maxMs = Math.max(current.maxMs, row.msMax ?? 0);
        totals.set(time, current);
    }
    const result = [...totals.entries()]
        .sort((a, b) => a[0] - b[0])
        .map(([time, total]) => ({
            bucket: new Date(time),
            count: total.count,
            avgMs: total.count ? Math.round(total.msSum / total.count) : 0,
            maxMs: total.maxMs,
        }));
    return fillTimeBuckets(result, query);
}

export function readMemoryTop(
    rows: RollupRows,
    metric: string,
    dimensions: string | string[],
    from: Date,
    to: Date,
    limit: number,
): KeyCount[] {
    const counts = new Map<string, number>();
    for (const dimension of typeof dimensions === "string" ? [dimensions] : dimensions) {
        for (const row of selectRows(rows, metric, dimension, from, to)) {
            counts.set(row.key, (counts.get(row.key) ?? 0) + row.count);
        }
    }
    const result = [...counts.entries()].map(([key, count]) => ({ key, count })).sort((a, b) => b.count - a.count);
    return limit > 0 ? result.slice(0, limit) : result;
}

export function readMemoryFlows(rows: RollupRows, from: Date, to: Date, limit: number): FlowCount[] {
    return readMemoryTop(rows, "flow", "edge", from, to, limit).flatMap((row) => {
        const edge = parseFlowKey(row.key);
        return edge ? [{ ...edge, count: row.count }] : [];
    });
}

export function readMemoryHealth(rows: RollupRows, from: Date, to: Date): AnalyticsHealthSummary {
    const requests = selectRows(rows, "request", "all", from, to);
    const requestCount = sum(requests, "count");
    const outcomes = (key: string) =>
        selectRows(rows, "request", "outcome", from, to)
            .filter((row) => row.key === key)
            .reduce((total, row) => total + row.count, 0);
    const notFound = outcomes("not_found");
    return {
        requests: requestCount,
        notFound,
        clientErrors: notFound + outcomes("client_error"),
        serverErrors: outcomes("server_error"),
        avgMs: requestCount ? Math.round(sum(requests, "msSum") / requestCount) : 0,
        maxMs: requests.reduce((max, row) => Math.max(max, row.msMax ?? 0), 0),
    };
}

function selectRows(rows: RollupRows, metric: string, dimension: string, from: Date, to: Date): RollupUpsert[] {
    return rows.filter(
        (row) => row.metric === metric && row.dim === dimension && row.bucket >= from && row.bucket < to,
    );
}

function sum(rows: RollupUpsert[], field: "count" | "msSum"): number {
    return rows.reduce((total, row) => total + (row[field] ?? 0), 0);
}

function average(total: number, count: number): number {
    return count ? Math.round((total / count) * 100) / 100 : 0;
}
