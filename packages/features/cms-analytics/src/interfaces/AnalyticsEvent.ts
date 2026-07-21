/**
 * The analytics event — the stable contract between the collector (delivery) and
 * any AnalyticsStore implementation. V1 never persists the raw event (counters are
 * incremented at write time), but the event stays the contract: swapping the backend
 * is a new AnalyticsStore, the producer is untouched. That decoupling is the point.
 */

/** Kind of event. Page-views only in V1; "gateway" is added in V2. */
export type AnalyticsEventType = "pageview";

/** A single server-side observation, built in delivery's page handler. */
export type AnalyticsEvent = {
    type: AnalyticsEventType;
    ts: Date; // server timestamp
    path: string; // normalized pathname (no query string)
    status: number; // 200 | 304 | 404 | 500 ...
    durationMs: number; // server-side latency measured in the handler
    pageId?: string; // TPage.id when the page resolved
    referrerHost?: string; // EXTERNAL referer host only (cross-origin) — data minimization
    fromPath?: string; // same-origin referer pathname (internal nav) → flow|edge counter
    visitorId: string; // sha256(IP + UA + daily salt) — anonymous, rotated daily
    device: "mobile" | "tablet" | "desktop" | "bot" | "other";
    browser: string; // 'chrome' | 'firefox' | 'safari' | 'edge' | 'other'
};
