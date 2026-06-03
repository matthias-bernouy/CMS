import { describe, test, expect } from "bun:test";
import { dailySalt, visitorId } from "cms-analytics/core/visitor";

describe("dailySalt", () => {
    test("is a 64-char hex sha256", async () => {
        expect(await dailySalt("secret", "2026-06-02")).toMatch(/^[0-9a-f]{64}$/);
    });
    test("rotates with the day", async () => {
        expect(await dailySalt("secret", "2026-06-02")).not.toBe(await dailySalt("secret", "2026-06-03"));
    });
    test("depends on the secret", async () => {
        expect(await dailySalt("s1", "2026-06-02")).not.toBe(await dailySalt("s2", "2026-06-02"));
    });
});

describe("visitorId", () => {
    test("is deterministic for the same inputs and a 64-char hex", async () => {
        const salt = await dailySalt("secret", "2026-06-02");
        const a = await visitorId("1.2.3.4", "UA", salt);
        expect(a).toBe(await visitorId("1.2.3.4", "UA", salt));
        expect(a).toMatch(/^[0-9a-f]{64}$/);
    });
    test("differs by ip, ua, and salt", async () => {
        const salt = await dailySalt("secret", "2026-06-02");
        const base = await visitorId("1.2.3.4", "UA", salt);
        expect(await visitorId("9.9.9.9", "UA", salt)).not.toBe(base);
        expect(await visitorId("1.2.3.4", "OTHER", salt)).not.toBe(base);
        expect(await visitorId("1.2.3.4", "UA", await dailySalt("secret", "2026-06-03"))).not.toBe(base);
    });
});
