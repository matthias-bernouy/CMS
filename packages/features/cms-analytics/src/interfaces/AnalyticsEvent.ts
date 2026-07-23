/**
 * The analytics event — the stable contract between the collector (delivery) and
 * any AnalyticsStore implementation. V1 never persists the raw event (counters are
 * incremented at write time), but the event stays the contract: swapping the backend
 * is a new AnalyticsStore, the producer is untouched. That decoupling is the point.
 */

/** Kind of event. Delivery observations only in the strict profile. */
export type AnalyticsEventType = "delivery_request";
export type AnalyticsBrowser = "chrome" | "edge" | "firefox" | "opera" | "safari" | "other";
export type AnalyticsDevice = "mobile" | "tablet" | "desktop" | "other";
export type AnalyticsExclusionReason =
    | "automation"
    | "invalid_user_agent"
    | "prefetch"
    | "prerender"
    | "system_route"
    | "unsupported_method";

/**
 * One in-memory delivery observation. The visitor hash is consumed by HLL++
 * and never persisted as a raw event or per-visitor row.
 */
export type AnalyticsEvent = {
    type: AnalyticsEventType;
    ts: Date;
    status: number;
    durationMs: number;
    contentKind: "html" | "other";
    pageId?: string;
    previousPageId?: string;
    entry: boolean;
    referrerDomain?: string;
    visitorHash?: string;
    device: AnalyticsDevice;
    browser: AnalyticsBrowser;
    exclusionReason?: AnalyticsExclusionReason;
};
