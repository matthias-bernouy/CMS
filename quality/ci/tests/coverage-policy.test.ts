import { describe, expect, test } from "bun:test";
import {
    assertBaselineUpdateAllowed,
    assertEveryPackageHasTests,
    normalizeCoverageReference,
    resolveCoverageReference,
} from "../coverage-ratchet";

describe("coverage policy", () => {
    test("requires every workspace package to own a test directory", () => {
        expect(() => assertEveryPackageHasTests([
            { name: "@bernouy/covered", path: "packages/features/covered", hasTests: true },
            { name: "@bernouy/untested", path: "packages/features/untested", hasTests: false },
        ])).toThrow("missing: @bernouy/untested");
    });

    test("forbids baseline generation inside CI", () => {
        expect(() => assertBaselineUpdateAllowed(true, "true")).toThrow("forbidden in CI");
        expect(() => assertBaselineUpdateAllowed(true, undefined)).not.toThrow();
        expect(() => assertBaselineUpdateAllowed(false, "true")).not.toThrow();
    });

    test("ignores an empty initial-push reference", () => {
        expect(normalizeCoverageReference(undefined)).toBeUndefined();
        expect(normalizeCoverageReference("  ")).toBeUndefined();
        expect(normalizeCoverageReference("0000000000000000000000000000000000000000")).toBeUndefined();
        expect(normalizeCoverageReference("abc123")).toBe("abc123");
        expect(resolveCoverageReference(undefined, "true")).toBe("HEAD^");
        expect(resolveCoverageReference(undefined, undefined)).toBeUndefined();
    });
});
