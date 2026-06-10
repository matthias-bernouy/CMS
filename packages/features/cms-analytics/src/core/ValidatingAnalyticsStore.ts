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
    if (event.type !== "pageview") throw new AnalyticsValidationError("type", `unknown event type "${event.type}"`);
    if (!(event.ts instanceof Date) || Number.isNaN(event.ts.getTime())) throw new AnalyticsValidationError("ts", "expected a valid Date");
    if (!event.path.startsWith("/")) throw new AnalyticsValidationError("path", "expected a pathname starting with /");
    if (event.path.includes("?")) throw new AnalyticsValidationError("path", "expected a normalized pathname (no query string)");
    if (!Number.isInteger(event.status) || event.status < 100 || event.status > 599) throw new AnalyticsValidationError("status", "expected an HTTP status code");
    if (!Number.isFinite(event.durationMs) || event.durationMs < 0) throw new AnalyticsValidationError("durationMs", "expected a non-negative duration");
    if (!event.visitorId) throw new AnalyticsValidationError("visitorId", "required");
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

    init()                                                          { return this.inner.init(); }
    summary(from: Date, to: Date)                                   { return this.inner.summary(from, to); }
    timeseries(q: RangeQuery)                                       { return this.inner.timeseries(q); }
    topPaths(from: Date, to: Date, limit: number)                   { return this.inner.topPaths(from, to, limit); }
    breakdown(dim: "status" | "device" | "browser", from: Date, to: Date) { return this.inner.breakdown(dim, from, to); }
}
