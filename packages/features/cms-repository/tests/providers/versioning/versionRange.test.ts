import { describe, expect, test } from "bun:test";
import { parseVersionRange, satisfiesVersionRange } from "@bernouy/cms-repository/providers";

describe("provider version ranges", () => {
    test("supports exact, caret, tilde, and comparator ranges", () => {
        expect(satisfiesVersionRange("1.2.3", parseVersionRange("1.2.3", "$"))).toBe(true);
        expect(satisfiesVersionRange("1.9.0", parseVersionRange("^1.2.3", "$"))).toBe(true);
        expect(satisfiesVersionRange("2.0.0", parseVersionRange("^1.2.3", "$"))).toBe(false);
        expect(satisfiesVersionRange("1.2.9", parseVersionRange("~1.2.3", "$"))).toBe(true);
        expect(satisfiesVersionRange("1.3.0", parseVersionRange("~1.2.3", "$"))).toBe(false);
        expect(satisfiesVersionRange("1.5.0", parseVersionRange(">=1.0.0 <2.0.0", "$"))).toBe(true);
    });

    test("uses SemVer caret boundaries for zero-major releases", () => {
        expect(satisfiesVersionRange("0.2.9", parseVersionRange("^0.2.3", "$"))).toBe(true);
        expect(satisfiesVersionRange("0.3.0", parseVersionRange("^0.2.3", "$"))).toBe(false);
        expect(satisfiesVersionRange("0.0.4", parseVersionRange("^0.0.3", "$"))).toBe(false);
    });

    test("excludes prereleases unless the range explicitly admits their release tuple", () => {
        expect(satisfiesVersionRange("2.0.0-alpha.1", parseVersionRange("^1.0.0", "$"))).toBe(false);
        expect(satisfiesVersionRange("1.3.0-beta.1", parseVersionRange("~1.2.3", "$"))).toBe(false);
        expect(satisfiesVersionRange("1.5.0-beta.1", parseVersionRange(">=1.0.0 <2.0.0", "$"))).toBe(false);
        expect(satisfiesVersionRange("1.0.0-beta.2", parseVersionRange(">=1.0.0-beta.1 <2.0.0", "$"))).toBe(true);
    });

    test("rejects ambiguous and non-canonical ranges", () => {
        expect(() => parseVersionRange("^1", "$.range")).toThrow("SemVer range");
        expect(() => parseVersionRange(">=1.0.0  <2.0.0", "$.range")).toThrow("SemVer range");
    });

    test("preserves arbitrary numeric precision", () => {
        expect(satisfiesVersionRange("1.0.0-9007199254740992", parseVersionRange("1.0.0-9007199254740993", "$"))).toBe(
            false,
        );
        expect(satisfiesVersionRange("9007199254740992.1.0", parseVersionRange("^9007199254740992.0.0", "$"))).toBe(
            true,
        );
        expect(satisfiesVersionRange("9007199254740993.0.0", parseVersionRange("^9007199254740992.0.0", "$"))).toBe(
            false,
        );
    });

    test("shares canonical unions and comparator ordering with contracts", () => {
        const range = parseVersionRange("^2.0.0 || ^1.0.0", "$");
        expect(range).toBe("^1.0.0 || ^2.0.0");
        expect(satisfiesVersionRange("2.1.0", range)).toBe(true);
        expect(satisfiesVersionRange("3.0.0", range)).toBe(false);
        expect(parseVersionRange(">=1.0.0 <2.0.0", "$")).toBe("<2.0.0 >=1.0.0");
    });
});
