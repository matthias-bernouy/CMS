import { describe, test, expect } from "bun:test";

import { placeholderName } from "src/core/proxy/placeholderName";

describe("placeholderName", () => {
    test("returns SECRET_<16 hex>", () => {
        const name = placeholderName("bucket-a", "stripe");
        expect(name).toMatch(/^SECRET_[0-9A-F]{16}$/);
    });

    test("is deterministic for the same triple", () => {
        const a = placeholderName("bucket-a", "stripe", 0);
        const b = placeholderName("bucket-a", "stripe", 0);
        expect(a).toBe(b);
    });

    test("differs across bucketId, providerId, secretIdx", () => {
        const seen = new Set([
            placeholderName("a", "p", 0),
            placeholderName("b", "p", 0),
            placeholderName("a", "q", 0),
            placeholderName("a", "p", 1),
        ]);
        expect(seen.size).toBe(4);
    });

    test("string-concat collisions are not exploitable thanks to NUL separators", () => {
        const a = placeholderName("foo", "barbaz");
        const b = placeholderName("foobar", "baz");
        expect(a).not.toBe(b);
    });
});
