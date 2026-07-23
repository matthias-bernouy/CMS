/**
 * Maps one AnalyticsEvent to bounded counter upserts. Request health remains
 * separate from content views; bots only increment an exclusion-reason counter.
 */

import type { AnalyticsEvent } from "../../interfaces/AnalyticsEvent";
import { DEFAULT_ANALYTICS_COLLECTION_POLICY, type AnalyticsCollectionPolicy } from "../../interfaces/AnalyticsPolicy";
import { isContentView } from "../collection/analyticsPolicy";
import { NO_EXTERNAL_REFERRER } from "../referrers/FrequentItems";
import { truncateToHour, hourKey, rollupId } from "./buckets";

/** One counter upsert: $inc count (+ msSum), $max msMax, on a deterministic _id. */
export type RollupUpsert = {
    id: string;
    metric: string;
    dim: string;
    key: string;
    bucket: Date;
    count: number;
    msSum?: number;
    msMax?: number;
    expiresAt: Date;
};

/** Whether an event counts toward content views/visitors. PURE. */
export const isCountedEvent = (
    event: AnalyticsEvent,
    policy: AnalyticsCollectionPolicy = DEFAULT_ANALYTICS_COLLECTION_POLICY,
): boolean => isContentView(event, policy);

/**
 * Page request → request health plus content rollups when the policy accepts it.
 * Same-origin navigation adds a structured flow edge. PURE.
 */
export function eventToWrites(
    event: AnalyticsEvent,
    policy: AnalyticsCollectionPolicy = DEFAULT_ANALYTICS_COLLECTION_POLICY,
): RollupUpsert[] {
    if (!policy.enabled) {
        return [];
    }
    const bucket = truncateToHour(event.ts);
    const tk = hourKey(event.ts);
    const write = (metric: string, dim: string, key: string, extra?: Partial<RollupUpsert>): RollupUpsert => ({
        id: rollupId(metric, dim, key, tk),
        metric,
        dim,
        key,
        bucket,
        count: 1,
        expiresAt: new Date(bucket.getTime() + policy.rollupRetentionDays * 86_400_000),
        ...extra,
    });

    if (event.exclusionReason) {
        return [write("excluded", "reason", event.exclusionReason)];
    }

    const writes = [
        write("request", "all", "_", { msSum: event.durationMs, msMax: event.durationMs }),
        write("request", "status", String(event.status)),
        write("request", "outcome", requestOutcome(event.status)),
        write("request", "latency", latencyBin(event.durationMs)),
    ];
    if (!isContentView(event, policy)) {
        return writes;
    }

    writes.push(
        write("pv", "all", "_", { msSum: event.durationMs, msMax: event.durationMs }),
        write("pv", "page", event.pageId!),
        write("pv", "status", String(event.status)),
        write("pv", "device", event.device),
        write("pv", "browser", event.browser),
    );
    if (event.entry) {
        writes.push(write("entry", "page", event.pageId!));
        if (!event.referrerDomain) {
            writes.push(write("pv", "referrer", NO_EXTERNAL_REFERRER));
        }
    }
    if (event.previousPageId && event.previousPageId !== event.pageId) {
        const key = JSON.stringify([event.previousPageId, event.pageId]);
        writes.push(write("flow", "edge", key));
    }
    return writes;
}

function requestOutcome(status: number): string {
    if (status === 404) {
        return "not_found";
    }
    if (status >= 500) {
        return "server_error";
    }
    if (status >= 400) {
        return "client_error";
    }
    if (status >= 300 && status !== 304) {
        return "redirect";
    }
    return "success";
}

function latencyBin(durationMs: number): string {
    if (durationMs <= 100) {
        return "0-100";
    }
    if (durationMs <= 250) {
        return "101-250";
    }
    if (durationMs <= 500) {
        return "251-500";
    }
    if (durationMs <= 1_000) {
        return "501-1000";
    }
    if (durationMs <= 2_500) {
        return "1001-2500";
    }
    return "2501+";
}
