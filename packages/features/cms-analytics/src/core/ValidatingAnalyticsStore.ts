import type { AnalyticsStore, RangeQuery } from "../interfaces/AnalyticsStore";
import type { AnalyticsEvent } from "../interfaces/AnalyticsEvent";

/** Thrown when an event breaks the analytics collection rules. Carries `.status`
 *  so any HTTP surface maps it to a 400 without importing surface errors. */
export class AnalyticsValidationError extends Error {
    status = 400;
    constructor(field: string, message: string) {
        super(`Invalid ${field}: ${message}`);
        this.name = "AnalyticsValidationError";
    }
}

/**
 * The event invariants the counters depend on — `buildPageViewEvent` produces
 * conforming events by construction; this is the seam rule for any OTHER
 * writer (a V2 gateway collector, a buggy caller). A non-normalized path
 * (query string kept) or a blank visitorId would silently corrupt the
 * rollups/unique-visitor counters, so they are rejected instead.
 */
export function validateAnalyticsEvent(event: AnalyticsEvent): void {
    if (event.type !== "pageview") {
        throw new AnalyticsValidationError("type", `unknown event type "${event.type}"`);
    }
    if (!(event.ts instanceof Date) || Number.isNaN(event.ts.getTime())) {
        throw new AnalyticsValidationError("ts", "expected a valid Date");
    }
    if (!event.path.startsWith("/")) {
        throw new AnalyticsValidationError("path", "expected a pathname starting with /");
    }
    if (event.path.includes("?")) {
        throw new AnalyticsValidationError("path", "expected a normalized pathname (no query string)");
    }
    if (event.path.length > 2_048) {
        throw new AnalyticsValidationError("path", "must be at most 2048 characters");
    }
    if (!Number.isInteger(event.status) || event.status < 100 || event.status > 599) {
        throw new AnalyticsValidationError("status", "expected an HTTP status code");
    }
    if (!Number.isFinite(event.durationMs) || event.durationMs < 0) {
        throw new AnalyticsValidationError("durationMs", "expected a non-negative duration");
    }
    if (!event.visitorId) {
        throw new AnalyticsValidationError("visitorId", "required");
    }
    if (event.visitorId.length > 256) {
        throw new AnalyticsValidationError("visitorId", "must be at most 256 characters");
    }
    if (
        event.pageId !== undefined &&
        (!event.pageId.trim() || event.pageId !== event.pageId.trim() || event.pageId.length > 256)
    ) {
        throw new AnalyticsValidationError("pageId", "must be normalized, non-blank, and at most 256 characters");
    }
    if (event.fromPath !== undefined) {
        if (!event.fromPath.startsWith("/") || event.fromPath.includes("?") || event.fromPath.length > 2_048) {
            throw new AnalyticsValidationError("fromPath", "expected a pathname of at most 2048 characters");
        }
    }
    if (event.referrerHost !== undefined && !isNormalizedHostname(event.referrerHost)) {
        throw new AnalyticsValidationError("referrerHost", "expected a normalized hostname");
    }
    if (!["mobile", "tablet", "desktop", "bot", "other"].includes(event.device)) {
        throw new AnalyticsValidationError("device", "unknown device class");
    }
    if (!["chrome", "edge", "firefox", "opera", "safari", "other"].includes(event.browser)) {
        throw new AnalyticsValidationError("browser", "unknown browser class");
    }
}

function isNormalizedHostname(host: string): boolean {
    if (!host || host.length > 253 || host !== host.toLowerCase() || host.includes("/") || host.includes(":")) {
        return false;
    }
    try {
        return new URL(`http://${host}`).hostname === host;
    } catch {
        return false;
    }
}

/**
 * Decorator that validates every event on `record` before delegating — the
 * unbypassable barrier at the store seam. Reads (dashboard queries) and
 * `init` pass straight through.
 *
 *   `new ValidatingAnalyticsStore(new MongoAnalyticsStore(db))`
 */
export class ValidatingAnalyticsStore implements AnalyticsStore {
    constructor(private readonly inner: AnalyticsStore) {}

    async record(event: AnalyticsEvent): Promise<void> {
        validateAnalyticsEvent(event);
        return this.inner.record(event);
    }

    init() {
        return this.inner.init();
    }
    summary(from: Date, to: Date) {
        return this.inner.summary(from, to);
    }
    timeseries(q: RangeQuery) {
        return this.inner.timeseries(q);
    }
    topPaths(from: Date, to: Date, limit: number) {
        return this.inner.topPaths(from, to, limit);
    }
    topPages(from: Date, to: Date, limit: number) {
        return this.inner.topPages(from, to, limit);
    }
    breakdown(dim: "status" | "device" | "browser" | "acquisition", from: Date, to: Date) {
        return this.inner.breakdown(dim, from, to);
    }
    topReferrers(from: Date, to: Date, limit: number) {
        return this.inner.topReferrers(from, to, limit);
    }
    flows(from: Date, to: Date, limit: number) {
        return this.inner.flows(from, to, limit);
    }
    health(from: Date, to: Date) {
        return this.inner.health(from, to);
    }
}
