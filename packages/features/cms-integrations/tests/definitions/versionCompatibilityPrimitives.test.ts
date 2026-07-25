import { describe, expect, test } from "bun:test";
import {
    integrationVersionRangeContainsRange,
    integrationVersionReleaseLevel,
    integrationVersionsShareMajor,
} from "@bernouy/cms-integrations";

describe("integration compatibility SemVer primitives", () => {
    test.each([
        ["1.2.3", "1.2.4", "patch"],
        ["1.2.3", "1.3.0", "minor"],
        ["1.2.3", "2.0.0", "major"],
        ["2.0.0-beta.1", "2.0.0-beta.2", "patch"],
        ["1.2.3", "2.0.0-beta.1", "major"],
    ])("classifies %s -> %s as %s", (previous, next, expected) => {
        expect(integrationVersionReleaseLevel(previous, next)).toBe(expected);
    });

    test("rejects invalid, equal, and descending transitions", () => {
        expect(integrationVersionReleaseLevel("1.0.0", "1.0.0")).toBeNull();
        expect(integrationVersionReleaseLevel("2.0.0", "1.0.0")).toBeNull();
        expect(integrationVersionReleaseLevel("latest", "2.0.0")).toBeNull();
    });

    test("uses maintained SemVer subset behavior to identify range narrowing", () => {
        expect(integrationVersionRangeContainsRange(">=1.0.0 <3.0.0", "^1.2.0")).toBeTrue();
        expect(integrationVersionRangeContainsRange("^1.2.0", ">=1.0.0 <2.0.0")).toBeFalse();
        expect(integrationVersionRangeContainsRange("^1.2.0", "~1.2.0")).toBeTrue();
        expect(integrationVersionRangeContainsRange("~1.2.0", "^1.2.0")).toBeFalse();
        expect(integrationVersionRangeContainsRange("*", "^1.2.0")).toBeFalse();
    });

    test("compares major lines through SemVer parsing", () => {
        expect(integrationVersionsShareMajor("2.0.0-beta.1", "2.4.0")).toBeTrue();
        expect(integrationVersionsShareMajor("1.9.9", "2.0.0")).toBeFalse();
        expect(integrationVersionsShareMajor("latest", "2.0.0")).toBeFalse();
    });
});
