import { describe, test, expect } from "bun:test";
import { truncateToHour, truncateToDay, hourKey, dayKey, rollupId } from "cms-analytics/core/buckets";

const T = new Date("2026-06-02T14:37:45.123Z");

describe("buckets", () => {
    test("truncateToHour zeroes minutes/seconds/ms (UTC)", () => {
        expect(truncateToHour(T).toISOString()).toBe("2026-06-02T14:00:00.000Z");
    });
    test("truncateToDay zeroes to UTC midnight", () => {
        expect(truncateToDay(T).toISOString()).toBe("2026-06-02T00:00:00.000Z");
    });
    test("hourKey", () => expect(hourKey(T)).toBe("2026-06-02T14"));
    test("dayKey", () => expect(dayKey(T)).toBe("2026-06-02"));
    test("rollupId escapes dimension keys", () =>
        expect(rollupId("pv", "path", "/about", "2026-06-02T14")).toBe("pv|path|%2Fabout|2026-06-02T14"));
});
