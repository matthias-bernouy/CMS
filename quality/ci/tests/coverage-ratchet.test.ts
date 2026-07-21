import { describe, expect, test } from "bun:test";
import {
    assertBaselineUpdateAllowed,
    assertEveryPackageHasTests,
    compareCoverageBaselines,
    compareExactPackageCoverage,
    comparePackageCoverage,
    isPackageRemovalAllowed,
    isCoverageRegression,
    normalizeCoverageReference,
    parseLcov,
    parseRemovedOrRenamedPaths,
    parseRenamedSourcesByDestination,
    resolveCoverageReference,
    type CoverageBaseline,
    type PackageCoverage,
} from "../coverage-ratchet";

const packageCoverage = (overrides: Partial<PackageCoverage> = {}): PackageCoverage => ({
    path: "packages/features/example",
    coveredSourceFiles: ["packages/features/example/src/covered.ts"],
    uncoveredSourceFiles: ["packages/features/example/src/uncovered.ts"],
    files: { covered: 1, total: 2 },
    functions: { covered: 8, total: 10 },
    lines: { covered: 80, total: 100 },
    ...overrides,
});

describe("coverage ratchet", () => {
    test("aggregates only implementation records from the selected package", () => {
        const coverage = parseLcov(
            [
                "TN:",
                "SF:packages/features/example/src/index.ts",
                "FNF:2",
                "FNH:1",
                "LF:10",
                "LH:8",
                "end_of_record",
                "TN:",
                "SF:packages/features/example/tests/index.test.ts",
                "FNF:1",
                "FNH:1",
                "LF:5",
                "LH:5",
                "end_of_record",
                "TN:",
                "SF:packages/features/other/src/index.ts",
                "FNF:4",
                "FNH:4",
                "LF:20",
                "LH:20",
                "end_of_record",
            ].join("\n"),
            "packages/features/example",
        );

        expect(coverage.coveredFiles).toEqual(new Set(["packages/features/example/src/index.ts"]));
        expect(coverage.functions).toEqual({ covered: 1, total: 2 });
        expect(coverage.lines).toEqual({ covered: 8, total: 10 });
    });

    test("compares exact ratios without rounding", () => {
        expect(isCoverageRegression({ covered: 8, total: 10 }, { covered: 80, total: 100 })).toBeFalse();
        expect(isCoverageRegression({ covered: 8, total: 10 }, { covered: 81, total: 100 })).toBeFalse();
        expect(isCoverageRegression({ covered: 8, total: 10 }, { covered: 799, total: 1000 })).toBeTrue();
    });

    test("does not invent a regression for an empty baseline", () => {
        expect(isCoverageRegression({ covered: 0, total: 0 }, { covered: 0, total: 12 })).toBeFalse();
        expect(isCoverageRegression({ covered: 1, total: 2 }, { covered: 0, total: 0 })).toBeTrue();
    });

    test("rejects new uncovered files and disappearing covered files", () => {
        const regressions = comparePackageCoverage(
            packageCoverage(),
            packageCoverage({
                coveredSourceFiles: [],
                uncoveredSourceFiles: [
                    "packages/features/example/src/new.ts",
                    "packages/features/example/src/uncovered.ts",
                ],
                files: { covered: 0, total: 2 },
            }),
            "example",
        );

        expect(regressions).toContain(
            "example: covered source disappeared: packages/features/example/src/covered.ts",
        );
        expect(regressions).toContain("example: newly uncovered source: packages/features/example/src/new.ts");
    });

    test("prevents a committed baseline from lowering an existing ratio", () => {
        const regressions = comparePackageCoverage(
            packageCoverage(),
            packageCoverage({ lines: { covered: 79, total: 100 } }),
            "committed baseline/example",
        );

        expect(regressions).toContain("committed baseline/example: lines decreased from 80.00% to 79.00%");
    });

    test("requires every workspace package to own a test directory", () => {
        expect(() =>
            assertEveryPackageHasTests([
                { name: "@bernouy/covered", path: "packages/features/covered", hasTests: true },
                { name: "@bernouy/untested", path: "packages/features/untested", hasTests: false },
            ]),
        ).toThrow("missing: @bernouy/untested");
    });

    test("allows a covered path to leave the baseline only when Git records a delete or rename", () => {
        const changes = [
            "D\tpackages/features/example/src/covered.ts",
            "R100\tpackages/features/example/src/old.ts\tpackages/features/example/src/new.ts",
            "M\tpackages/features/example/src/modified.ts",
        ].join("\n");
        const removed = parseRemovedOrRenamedPaths(changes);
        expect(removed).toEqual(
            new Set([
                "packages/features/example/src/covered.ts",
                "packages/features/example/src/old.ts",
            ]),
        );
        expect(
            comparePackageCoverage(
                packageCoverage(),
                packageCoverage({
                    coveredSourceFiles: [],
                    uncoveredSourceFiles: ["packages/features/example/src/uncovered.ts"],
                    files: { covered: 0, total: 1 },
                }),
                "example",
                removed,
            ),
        ).not.toContain("example: covered source disappeared: packages/features/example/src/covered.ts");
    });

    test("preserves uncovered state across a Git rename without hiding a covered-to-uncovered regression", () => {
        const uncoveredSource = "packages/features/example/src/uncovered.ts";
        const uncoveredDestination = "packages/features/example/src/renamed-uncovered.ts";
        const coveredSource = "packages/features/example/src/covered.ts";
        const coveredDestination = "packages/features/example/src/renamed-covered.ts";
        const changes = [
            `R100\t${uncoveredSource}\t${uncoveredDestination}`,
            `R100\t${coveredSource}\t${coveredDestination}`,
        ].join("\n");
        const removed = parseRemovedOrRenamedPaths(changes);
        const renames = parseRenamedSourcesByDestination(changes);

        const preservedUncovered = comparePackageCoverage(
            packageCoverage(),
            packageCoverage({
                uncoveredSourceFiles: [uncoveredDestination],
            }),
            "example",
            removed,
            renames,
        );
        expect(preservedUncovered).not.toContain(`example: newly uncovered source: ${uncoveredDestination}`);

        const lostCoverage = comparePackageCoverage(
            packageCoverage(),
            packageCoverage({
                coveredSourceFiles: [],
                uncoveredSourceFiles: [coveredDestination, uncoveredSource],
                files: { covered: 0, total: 2 },
            }),
            "example",
            removed,
            renames,
        );
        expect(lostCoverage).toContain(`example: newly uncovered source: ${coveredDestination}`);
    });

    test("allows a package to leave the baseline only with a deleted or renamed manifest", () => {
        expect(
            isPackageRemovalAllowed(
                "packages/features/example",
                new Set(["packages/features/example/package.json"]),
            ),
        ).toBeTrue();
        expect(
            isPackageRemovalAllowed(
                "packages/features/example",
                new Set(["packages/features/example/src/index.ts"]),
            ),
        ).toBeFalse();
        expect(
            comparePackageCoverage(
                packageCoverage(),
                packageCoverage({ path: "packages/features/renamed-example" }),
                "example",
                new Set(["packages/features/example/package.json"]),
            ),
        ).not.toContain(
            "example: path changed from packages/features/example to packages/features/renamed-example",
        );
    });

    test("keeps the coverage floor when a package path and name are renamed", () => {
        const oldPath = "packages/features/example";
        const newPath = "packages/features/renamed-example";
        const baseline: CoverageBaseline = {
            schemaVersion: 1,
            bunVersion: "1.3.14",
            packages: { "@bernouy/example": packageCoverage() },
        };
        const renamed: CoverageBaseline = {
            schemaVersion: 1,
            bunVersion: "1.3.14",
            packages: {
                "@bernouy/renamed-example": packageCoverage({
                    path: newPath,
                    coveredSourceFiles: [`${newPath}/src/covered.ts`],
                    uncoveredSourceFiles: [`${newPath}/src/uncovered.ts`],
                    lines: { covered: 79, total: 100 },
                }),
            },
        };
        const changes = [
            `R100\t${oldPath}/package.json\t${newPath}/package.json`,
            `R100\t${oldPath}/src/covered.ts\t${newPath}/src/covered.ts`,
            `R100\t${oldPath}/src/uncovered.ts\t${newPath}/src/uncovered.ts`,
        ].join("\n");

        const regressions = compareCoverageBaselines(
            baseline,
            renamed,
            "committed baseline",
            parseRemovedOrRenamedPaths(changes),
            parseRenamedSourcesByDestination(changes),
        );
        expect(regressions).toContain(
            "committed baseline/@bernouy/example -> @bernouy/renamed-example: lines decreased from 80.00% to 79.00%",
        );
    });

    test("keeps the coverage floor when only a package name changes", () => {
        const baseline: CoverageBaseline = {
            schemaVersion: 1,
            bunVersion: "1.3.14",
            packages: { "@bernouy/example": packageCoverage() },
        };
        const renamed: CoverageBaseline = {
            schemaVersion: 1,
            bunVersion: "1.3.14",
            packages: { "@bernouy/renamed-example": packageCoverage() },
        };
        expect(compareCoverageBaselines(baseline, renamed, "committed baseline")).toEqual([]);

        renamed.packages["@bernouy/renamed-example"] = packageCoverage({ lines: { covered: 79, total: 100 } });
        expect(compareCoverageBaselines(baseline, renamed, "committed baseline")).toContain(
            "committed baseline/@bernouy/example -> @bernouy/renamed-example: lines decreased from 80.00% to 79.00%",
        );
    });

    test("requires a new package baseline to equal its measured snapshot", () => {
        const lowered = packageCoverage({
            coveredSourceFiles: [],
            uncoveredSourceFiles: [
                "packages/features/example/src/covered.ts",
                "packages/features/example/src/uncovered.ts",
            ],
            files: { covered: 0, total: 2 },
            functions: { covered: 0, total: 0 },
            lines: { covered: 0, total: 0 },
        });
        expect(compareExactPackageCoverage(lowered, packageCoverage(), "new package/example")).toEqual([
            "new package/example: committed coverage must exactly match the measured package snapshot",
        ]);
        expect(compareExactPackageCoverage(packageCoverage(), packageCoverage(), "new package/example")).toEqual([]);
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
