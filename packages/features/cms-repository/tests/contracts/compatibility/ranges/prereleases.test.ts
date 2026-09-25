import { describe, expect, test } from "bun:test";
import {
    compareVersionRanges,
    isVersionRangeSubset,
    satisfiesVersionRange,
} from "@bernouy/cms-repository/contracts/compatibility";

describe("range prerelease inclusion", () => {
    test("preserves tuple opt-in even when the stable range grows", () => {
        expect(compareVersionRanges("^1.0.0-alpha.1", ">=1.0.0-alpha.1 <2.0.0")).toBe("equivalent");
        expect(compareVersionRanges("^1.1.0-alpha", "^1.0.0")).toBe("restricted");
        expect(compareVersionRanges("^1.0.0", "^1.0.0 || 1.2.0-alpha")).toBe("expanded");
        expect(isVersionRangeSubset("1.2.0-alpha", ">=1.0.0-alpha <2.0.0")).toBe(false);
        expect(satisfiesVersionRange("2.0.0-alpha", "^1.0.0")).toBe(false);
        expect(satisfiesVersionRange("1.3.0-beta", "~1.2.3")).toBe(false);
    });

    test("does not spread one branch's prerelease opt-in across other union branches", () => {
        const range = ">=1.0.0 <2.0.0 || >=1.5.0-beta <1.5.0-rc";
        expect(satisfiesVersionRange("1.5.0-beta.2", range)).toBe(true);
        expect(satisfiesVersionRange("1.5.0-alpha", range)).toBe(false);
        expect(satisfiesVersionRange("1.5.0-rc", range)).toBe(false);
        expect(isVersionRangeSubset(">=1.5.0-alpha <1.5.0", range)).toBe(false);
    });

    test("merges adjacent prerelease segments while retaining gaps", () => {
        const whole = ">=1.0.0-alpha <1.0.0";
        expect(compareVersionRanges(whole, ">=1.0.0-alpha <1.0.0-beta || >=1.0.0-beta <1.0.0")).toBe("equivalent");
        expect(compareVersionRanges(whole, ">=1.0.0-alpha <1.0.0-beta || >1.0.0-beta <1.0.0")).toBe("restricted");
        expect(compareVersionRanges(">1.0.0-alpha", ">=1.0.0-alpha.0")).toBe("equivalent");
        expect(compareVersionRanges("<=1.0.0-alpha", "<1.0.0-alpha.0")).toBe("equivalent");
    });

    test("does not skip prerelease extensions between consecutive numeric identifiers", () => {
        const lower = "1.0.0-9007199254740992";
        const upper = "1.0.0-9007199254740993";
        expect(satisfiesVersionRange(`${lower}.0`, `>${lower} <${upper}`)).toBe(true);
        expect(compareVersionRanges(`>${lower}`, `>=${upper}`)).toBe("restricted");
        expect(compareVersionRanges(lower, `>=${lower} <${lower}.0`)).toBe("equivalent");
        expect(isVersionRangeSubset(lower, upper)).toBe(false);
    });

    test("a prerelease-only bound does not invent stable members", () => {
        expect(satisfiesVersionRange("1.0.0", "<=1.0.0-alpha")).toBe(false);
        expect(satisfiesVersionRange("1.0.0-alpha.0", ">1.0.0-alpha <1.0.0-alpha.0")).toBe(false);
        expect(compareVersionRanges(">1.0.0-alpha <1.0.0-alpha.0", "<0.0.0")).toBe("equivalent");
        expect(satisfiesVersionRange("0.0.0-0", "<=0.0.0-0")).toBe(true);
    });
});
