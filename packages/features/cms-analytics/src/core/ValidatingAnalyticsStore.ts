import type { AnalyticsStore, RangeQuery } from "../interfaces/AnalyticsStore";
import type { AnalyticsEvent } from "../interfaces/AnalyticsEvent";
import { isNormalizedRegistrableDomain } from "./referrers/normalizeReferrer";

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
 * writer. Raw paths and durable visitor identifiers do not exist in this
 * contract: only stable CMS page ids and an ephemeral daily HMAC may cross it.
 */
export function validateAnalyticsEvent(event: AnalyticsEvent): void {
    if (event.type !== "delivery_request") {
        throw new AnalyticsValidationError("type", `unknown event type "${event.type}"`);
    }
    if (!(event.ts instanceof Date) || Number.isNaN(event.ts.getTime())) {
        throw new AnalyticsValidationError("ts", "expected a valid Date");
    }
    if (!Number.isInteger(event.status) || event.status < 100 || event.status > 599) {
        throw new AnalyticsValidationError("status", "expected an HTTP status code");
    }
    if (!Number.isFinite(event.durationMs) || event.durationMs < 0) {
        throw new AnalyticsValidationError("durationMs", "expected a non-negative duration");
    }
    if (event.contentKind !== "html" && event.contentKind !== "other") {
        throw new AnalyticsValidationError("contentKind", "expected html|other");
    }
    if (event.pageId !== undefined && !isSafeIdentifier(event.pageId)) {
        throw new AnalyticsValidationError("pageId", "must be normalized, non-blank, and at most 256 characters");
    }
    if (event.previousPageId !== undefined && !isSafeIdentifier(event.previousPageId)) {
        throw new AnalyticsValidationError(
            "previousPageId",
            "must be normalized, non-blank, and at most 256 characters",
        );
    }
    if (event.referrerDomain !== undefined && !isNormalizedRegistrableDomain(event.referrerDomain)) {
        throw new AnalyticsValidationError("referrerDomain", "expected a normalized registrable domain");
    }
    if (event.visitorHash !== undefined && !/^[0-9a-f]{64}$/.test(event.visitorHash)) {
        throw new AnalyticsValidationError("visitorHash", "expected a 64-character lowercase hexadecimal HMAC");
    }
    if (!["mobile", "tablet", "desktop", "other"].includes(event.device)) {
        throw new AnalyticsValidationError("device", "unknown device class");
    }
    if (!["chrome", "edge", "firefox", "opera", "safari", "other"].includes(event.browser)) {
        throw new AnalyticsValidationError("browser", "unknown browser class");
    }
    if (
        event.exclusionReason !== undefined &&
        !["automation", "invalid_user_agent", "prefetch", "prerender", "system_route", "unsupported_method"].includes(
            event.exclusionReason,
        )
    ) {
        throw new AnalyticsValidationError("exclusionReason", "unknown exclusion reason");
    }
}

function isSafeIdentifier(value: string): boolean {
    return Boolean(value.trim()) && value === value.trim() && value.length <= 256;
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
    finalizeVisitors(before: Date) {
        return this.inner.finalizeVisitors(before);
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
    breakdown(dim: "status" | "device" | "browser" | "exclusion", from: Date, to: Date) {
        return this.inner.breakdown(dim, from, to);
    }
    entries(from: Date, to: Date, limit: number) {
        return this.inner.entries(from, to, limit);
    }
    topReferrers(from: Date, to: Date, limit: number) {
        return this.inner.topReferrers(from, to, limit);
    }
    referrerSaturated(from: Date, to: Date) {
        return this.inner.referrerSaturated(from, to);
    }
    flows(from: Date, to: Date, limit: number) {
        return this.inner.flows(from, to, limit);
    }
    health(from: Date, to: Date) {
        return this.inner.health(from, to);
    }
}
