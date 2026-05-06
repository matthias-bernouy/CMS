import { describe, test, expect } from "bun:test";
import { canonicalHash } from "src/cli/push/pages/scan";

const base = {
    title:       "About",
    description: "Story",
    visible:     true,
    tags:        ["a", "b"],
    content:     "<p>hi</p>",
};

describe("canonicalHash", () => {
    test("is stable across calls for equal payloads", () => {
        expect(canonicalHash(base)).toBe(canonicalHash({ ...base }));
    });

    test("ignores tag ordering — sorted before hashing", () => {
        const reordered = { ...base, tags: ["b", "a"] };
        expect(canonicalHash(base)).toBe(canonicalHash(reordered));
    });

    test("changes when any tracked field changes", () => {
        const original = canonicalHash(base);
        expect(canonicalHash({ ...base, title:       "Other" })).not.toBe(original);
        expect(canonicalHash({ ...base, description: "Other" })).not.toBe(original);
        expect(canonicalHash({ ...base, visible:     false   })).not.toBe(original);
        expect(canonicalHash({ ...base, tags:        ["c"]   })).not.toBe(original);
        expect(canonicalHash({ ...base, content:     "x"     })).not.toBe(original);
    });
});
