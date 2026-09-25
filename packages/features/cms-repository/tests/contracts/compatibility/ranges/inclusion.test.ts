import { describe, expect, test } from "bun:test";
import { compareVersionRanges, isVersionRangeSubset } from "@bernouy/cms-repository/contracts/compatibility";

describe("semantic version range inclusion", () => {
    test.each([
        ["^1.1.0", ">=1.1.0 <2.0.0"],
        ["~1.2.3", ">=1.2.3 <1.3.0"],
        ["^0.2.3", ">=0.2.3 <0.3.0"],
        ["^0.0.3", "0.0.3"],
        ["1.2.3+build.one", "=1.2.3+build.two"],
        [">1.0.0 <1.0.2", "1.0.1"],
        ["^1.0.0 || ^2.0.0", ">=1.0.0 <3.0.0"],
        [">=1.0.0 <=1.0.1 || >=1.0.2 <2.0.0", "^1.0.0"],
        [">=1.0.0 <2.0.0 || >=1.5.0 <3.0.0", ">=1.0.0 <3.0.0"],
        [">2.0.0 <1.0.0", "<0.0.0"],
        [">=1.0.0", ">=1.0.0 <2.0.0 || >=2.0.0"],
    ])("treats %s and %s as equivalent", (previous, next) => {
        expect(compareVersionRanges(previous, next)).toBe("equivalent");
        expect(isVersionRangeSubset(next, previous)).toBe(true);
    });

    test.each([
        ["^1.1.0", "^1.0.0"],
        ["^1.0.0", "^1.0.0 || ^2.0.0"],
        [">1.0.0 <2.0.0", ">=1.0.0 <2.0.0"],
        ["^1.0.0", ">=1.0.0 <=2.0.0"],
        ["1.0.0 || 1.0.2", ">=1.0.0 <=1.0.2"],
        ["<0.0.0", "0.0.0"],
    ])("detects the expansion from %s to %s", (previous, next) => {
        expect(compareVersionRanges(previous, next)).toBe("expanded");
        expect(compareVersionRanges(next, previous)).toBe("restricted");
        expect(isVersionRangeSubset(previous, next)).toBe(true);
    });

    test.each([
        ["^1.0.0", ">=1.0.0 <1.5.0 || >1.5.0 <2.0.0"],
        [">=1.0.0 <3.0.0", "^1.0.0 || >=2.0.1 <3.0.0"],
        ["^1.0.0 || ^3.0.0", "^1.0.0 || ^2.0.0"],
        [">=1.0.0", ">=1.0.0 <9007199254740993.0.0"],
    ])("detects a lost version from %s to %s", (previous, next) => {
        expect(compareVersionRanges(previous, next)).toBe("restricted");
        expect(isVersionRangeSubset(previous, next)).toBe(false);
    });

    test("preserves arbitrary numeric precision in cores and generated upper bounds", () => {
        expect(compareVersionRanges("^9007199254740992.0.0", ">=9007199254740992.0.0 <9007199254740993.0.0")).toBe(
            "equivalent",
        );
        expect(compareVersionRanges("1.0.9007199254740992", ">=1.0.9007199254740992 <1.0.9007199254740993")).toBe(
            "equivalent",
        );
        expect(isVersionRangeSubset("9007199254740993.0.0", "^9007199254740992.0.0")).toBe(false);
    });
});
