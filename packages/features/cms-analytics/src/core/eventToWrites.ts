/**
 * Maps one AnalyticsEvent to bounded counter upserts. Request health remains
 * separate from content views; bots only increment an exclusion-reason counter.
 */

import type { AnalyticsEvent } from "../interfaces/AnalyticsEvent";
import { DEFAULT_ANALYTICS_COLLECTION_POLICY, type AnalyticsCollectionPolicy } from "../interfaces/AnalyticsPolicy";
import { isContentView, isIgnoredReferrer } from "./collection/analyticsPolicy";
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
    const bucket = truncateToHour(event.ts);
    const tk = hourKey(event.ts);
    const write = (metric: string, dim: string, key: string, extra?: Partial<RollupUpsert>): RollupUpsert => ({
        id: rollupId(metric, dim, key, tk),
        metric,
        dim,
        key,
        bucket,
        count: 1,
        ...extra,
    });

    if (event.device === "bot") {
        return [write("excluded", "reason", "bot")];
    }

    const writes = [
        write("request", "all", "_", { msSum: event.durationMs, msMax: event.durationMs }),
        write("request", "status", String(event.status)),
        write("request", "outcome", requestOutcome(event.status)),
    ];
    if (!isContentView(event, policy)) {
        return writes;
    }

    writes.push(
        write("pv", "all", "_", { msSum: event.durationMs, msMax: event.durationMs }),
        write("pv", "page", event.pageId ?? event.path),
        write("pv", "status", String(event.status)),
        write("pv", "device", event.device),
        write("pv", "browser", event.browser),
    );
    const acquisition = acquisitionChannel(event, policy);
    if (acquisition) {
        writes.push(write("pv", "acquisition", acquisition));
    }
    if (event.referrerHost && !isIgnoredReferrer(event.referrerHost, policy)) {
        writes.push(write("pv", "referrer", event.referrerHost));
    }
    if (event.fromPath && event.fromPath !== event.path) {
        const key = JSON.stringify([event.fromPath, event.path]);
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

function acquisitionChannel(
    event: AnalyticsEvent,
    policy: AnalyticsCollectionPolicy,
): "direct" | "internal" | "search" | "social" | "referral" | null {
    if (event.fromPath) {
        return "internal";
    }
    const host = event.referrerHost;
    if (!host) {
        return "direct";
    }
    if (isIgnoredReferrer(host, policy)) {
        return null;
    }
    if (matchesHost(host, SEARCH_HOSTS)) {
        return "search";
    }
    if (matchesHost(host, SOCIAL_HOSTS)) {
        return "social";
    }
    return "referral";
}

function matchesHost(host: string, suffixes: readonly string[]): boolean {
    const normalized = host.toLowerCase();
    return suffixes.some((suffix) => normalized === suffix || normalized.endsWith(`.${suffix}`));
}

const SEARCH_HOSTS = [
    "google.com",
    "bing.com",
    "duckduckgo.com",
    "search.yahoo.com",
    "ecosia.org",
    "qwant.com",
    "baidu.com",
    "yandex.com",
] as const;

const SOCIAL_HOSTS = [
    "facebook.com",
    "instagram.com",
    "linkedin.com",
    "twitter.com",
    "x.com",
    "reddit.com",
    "youtube.com",
    "tiktok.com",
    "pinterest.com",
] as const;
