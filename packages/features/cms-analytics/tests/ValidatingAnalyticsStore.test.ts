import { describe, test, expect } from "bun:test";
import {
    ValidatingAnalyticsStore,
    InMemoryAnalyticsStore,
    AnalyticsValidationError,
    type AnalyticsEvent,
} from "@bernouy/cms-analytics";

const event = (over: Partial<AnalyticsEvent> = {}): AnalyticsEvent => ({
    type: "pageview",
    ts: new Date("2026-06-10T12:00:00Z"),
    path: "/produits",
    status: 200,
    durationMs: 12,
    visitorId: "v1",
    device: "desktop",
    browser: "chrome",
    ...over,
});

const store = () => new ValidatingAnalyticsStore(new InMemoryAnalyticsStore());

describe("ValidatingAnalyticsStore", () => {
    test("a conforming event is recorded (delegation, counters move)", async () => {
        const s = store();
        await s.record(event());
        const sum = await s.summary(new Date("2026-06-10"), new Date("2026-06-11"));
        expect(sum.views).toBe(1);
        expect(sum.uniqueVisitors).toBe(1);
    });

    test("a path keeping its query string is rejected (counter-corruption guard)", async () => {
        await expect(store().record(event({ path: "/p?page=2" }))).rejects.toBeInstanceOf(AnalyticsValidationError);
    });

    test("a non-pathname path is rejected", async () => {
        await expect(store().record(event({ path: "https://x.com/p" }))).rejects.toMatchObject({ status: 400 });
    });

    test("a blank visitorId is rejected (unique-visitor dedup would degenerate)", async () => {
        await expect(store().record(event({ visitorId: "" }))).rejects.toBeInstanceOf(AnalyticsValidationError);
    });

    test("an out-of-range or non-integer status is rejected", async () => {
        await expect(store().record(event({ status: 42 }))).rejects.toBeInstanceOf(AnalyticsValidationError);
        await expect(store().record(event({ status: 200.5 }))).rejects.toBeInstanceOf(AnalyticsValidationError);
    });

    test("invalid ts / negative duration are rejected", async () => {
        await expect(store().record(event({ ts: new Date("nope") }))).rejects.toBeInstanceOf(AnalyticsValidationError);
        await expect(store().record(event({ durationMs: -1 }))).rejects.toBeInstanceOf(AnalyticsValidationError);
    });

    test("reads pass straight through", async () => {
        const s = store();
        await s.record(event());
        expect(await s.topPaths(new Date("2026-06-10"), new Date("2026-06-11"), 5)).toHaveLength(1);
        expect(await s.breakdown("device", new Date("2026-06-10"), new Date("2026-06-11"))).toHaveLength(1);
    });
});
