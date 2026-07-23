import { describe, expect, test } from "bun:test";
import {
    AnalyticsValidationError,
    InMemoryAnalyticsStore,
    ValidatingAnalyticsStore,
    type AnalyticsEvent,
} from "@bernouy/cms-analytics";

const event = (over: Partial<AnalyticsEvent> = {}): AnalyticsEvent => ({
    type: "delivery_request",
    ts: new Date("2026-06-10T12:00:00Z"),
    status: 200,
    durationMs: 12,
    contentKind: "html",
    pageId: "page-products",
    entry: true,
    visitorHash: "a".repeat(64),
    device: "desktop",
    browser: "chrome",
    ...over,
});
const store = () => new ValidatingAnalyticsStore(new InMemoryAnalyticsStore());

describe("ValidatingAnalyticsStore", () => {
    test("records a minimized conforming observation", async () => {
        const analytics = store();
        await analytics.record(event());
        expect((await analytics.summary(new Date("2026-06-10"), new Date("2026-06-11"))).views).toBe(1);
    });

    test("rejects invalid time, status, duration, and type", async () => {
        await expect(store().record(event({ type: "pageview" as never }))).rejects.toBeInstanceOf(
            AnalyticsValidationError,
        );
        await expect(store().record(event({ ts: new Date("invalid") }))).rejects.toBeInstanceOf(
            AnalyticsValidationError,
        );
        await expect(store().record(event({ status: 42 }))).rejects.toBeInstanceOf(AnalyticsValidationError);
        await expect(store().record(event({ durationMs: -1 }))).rejects.toBeInstanceOf(AnalyticsValidationError);
    });

    test("rejects unsafe identifiers, referrers, hashes, and dimensions", async () => {
        await expect(store().record(event({ pageId: " " }))).rejects.toBeInstanceOf(AnalyticsValidationError);
        await expect(store().record(event({ previousPageId: "x".repeat(257) }))).rejects.toBeInstanceOf(
            AnalyticsValidationError,
        );
        await expect(store().record(event({ referrerDomain: "Example.COM" }))).rejects.toBeInstanceOf(
            AnalyticsValidationError,
        );
        await expect(store().record(event({ visitorHash: "raw-id" }))).rejects.toBeInstanceOf(AnalyticsValidationError);
        await expect(store().record(event({ device: "bot" as never }))).rejects.toBeInstanceOf(
            AnalyticsValidationError,
        );
        await expect(store().record(event({ exclusionReason: "unknown" as never }))).rejects.toBeInstanceOf(
            AnalyticsValidationError,
        );
    });

    test("delegates all strict report methods", async () => {
        const analytics = store();
        await analytics.record(event({ previousPageId: "page-home", entry: false }));
        await analytics.finalizeVisitors(new Date("2026-06-11"));
        const range = [new Date("2026-06-10"), new Date("2026-06-11")] as const;
        expect(await analytics.topPaths(...range, 5)).toHaveLength(1);
        expect(await analytics.breakdown("device", ...range)).toHaveLength(1);
        expect(await analytics.flows(...range, 5)).toHaveLength(1);
        expect((await analytics.health(...range)).requests).toBe(1);
    });
});
