import { describe, expect, test } from "bun:test";
import {
    OTHER_REFERRERS,
    aggregateFrequentItems,
    emptyFrequentItems,
    updateFrequentItems,
} from "cms-analytics/core/referrers/FrequentItems";
import { normalizeExternalReferrer } from "cms-analytics/core/referrers/normalizeReferrer";

describe("normalizeExternalReferrer", () => {
    const current = new URL("https://shop.example.co.uk/product?private=1");

    test("keeps only a canonical registrable domain using the public suffix list", () => {
        expect(
            normalizeExternalReferrer(
                "https://user:password@news.source.co.uk:8443/story?utm_campaign=secret#part",
                current,
                "shop.example.co.uk",
            ),
        ).toBe("source.co.uk");
        expect(normalizeExternalReferrer("https://tenant.vercel.app/story", current, "shop.example.co.uk")).toBe(
            "tenant.vercel.app",
        );
    });

    test("rejects self-referrals, non-web schemes, IPs, and malformed values", () => {
        expect(
            normalizeExternalReferrer("https://blog.example.co.uk/story", current, "shop.example.co.uk"),
        ).toBeUndefined();
        expect(normalizeExternalReferrer("file://news.example/story", current, null)).toBeUndefined();
        expect(normalizeExternalReferrer("https://192.0.2.1/story", current, null)).toBeUndefined();
        expect(normalizeExternalReferrer("not a url", current, null)).toBeUndefined();
    });
});

describe("bounded frequent referrers", () => {
    test("keeps exact counts below capacity", () => {
        let snapshot = emptyFrequentItems();
        for (const key of ["a.example", "a.example", "b.example"]) {
            snapshot = updateFrequentItems(snapshot, key, 3);
        }
        expect(snapshot).toEqual({
            total: 3,
            candidates: [
                { key: "a.example", count: 2 },
                { key: "b.example", count: 1 },
            ],
            saturated: false,
        });
    });

    test("resists first-seen scanner pollution and accounts overflow as Other", () => {
        let snapshot = emptyFrequentItems();
        for (let index = 0; index < 100; index++) {
            snapshot = updateFrequentItems(snapshot, `scanner-${index}.example`, 4);
        }
        for (let index = 0; index < 50; index++) {
            snapshot = updateFrequentItems(snapshot, "news.example", 4);
        }
        const result = aggregateFrequentItems([snapshot]);
        expect(snapshot.candidates.length).toBeLessThanOrEqual(4);
        expect(snapshot.saturated).toBe(true);
        expect(result.find((item) => item.key === "news.example")?.count).toBeGreaterThan(20);
        expect(result.find((item) => item.key === OTHER_REFERRERS)?.count).toBeGreaterThan(0);
        expect(result.reduce((sum, item) => sum + item.count, 0)).toBe(150);
    });
});
