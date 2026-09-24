import { describe, expect, test } from "bun:test";
import { compareVersionRanges, parseVersionRange, satisfiesVersionRange } from "@bernouy/cms-contracts/compatibility";

describe("bounded version range parsing", () => {
    test.each([
        "",
        "^1",
        "1.2",
        "1.x",
        "*",
        "^1.0.0||^2.0.0",
        ">=1.0.0  <2.0.0",
        "^1.0.0 || ^1.0.0",
        "1.0.0 || 2.0.0 || 3.0.0 || 4.0.0 || 5.0.0",
        "1.0.0-01",
        "1.0.0\n",
        "^1.0.0\r",
        ">=1.0.0\u2028",
        `1.0.0+${"a".repeat(256)}`,
    ])("rejects unsupported or unbounded syntax %s", (range) => {
        expect(() => parseVersionRange(range, "$.range")).toThrow("SemVer range");
        expect(() => compareVersionRanges("^1.0.0", range)).toThrow("SemVer range");
    });

    test("normalizes branch and comparator order without interpreting build metadata as prerelease", () => {
        expect(parseVersionRange("^2.0.0 || >=1.0.0 <2.0.0", "$")).toBe("<2.0.0 >=1.0.0 || ^2.0.0");
        expect(satisfiesVersionRange("1.0.0+build-with-hyphens", "^1.0.0")).toBe(true);
        expect(satisfiesVersionRange("1.0.0-alpha+build", "1.0.0-alpha")).toBe(true);
        expect(satisfiesVersionRange("1.0", "^1.0.0")).toBe(false);
        expect(satisfiesVersionRange("1.0.0\n", "^1.0.0")).toBe(false);
    });
});
