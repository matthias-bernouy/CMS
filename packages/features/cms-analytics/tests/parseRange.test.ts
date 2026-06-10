import { describe, test, expect } from "bun:test";
import { parseRange } from "cms-analytics/core/parseRange";

const NOW = new Date("2026-06-04T12:00:00.000Z");

describe("parseRange", () => {
    test("24h → hourly buckets, 24h window", () => {
        const r = parseRange("24h", NOW);
        expect(r.interval).toBe("hour");
        expect(r.to).toEqual(NOW);
        expect(r.from.toISOString()).toBe("2026-06-03T12:00:00.000Z");
    });

    test("7d → daily buckets, 7-day window", () => {
        const r = parseRange("7d", NOW);
        expect(r.interval).toBe("day");
        expect(r.from.toISOString()).toBe("2026-05-28T12:00:00.000Z");
    });

    test("30d → daily buckets, 30-day window", () => {
        const r = parseRange("30d", NOW);
        expect(r.interval).toBe("day");
        expect(r.from.toISOString()).toBe("2026-05-05T12:00:00.000Z");
    });

    test("unknown/missing → defaults to 7d", () => {
        expect(parseRange(null, NOW)).toEqual(parseRange("7d", NOW));
        expect(parseRange("bogus", NOW)).toEqual(parseRange("7d", NOW));
    });
});
