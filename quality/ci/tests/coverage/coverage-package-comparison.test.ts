import { describe, expect, test } from "bun:test";
import {
    comparePackageCoverage,
    isCoverageRegression,
    isPackageRemovalAllowed,
    parseRemovedOrRenamedPaths,
    parseRenamedSourcesByDestination,
} from "../../coverage/ratchet";
import { packageCoverage } from "./coverage-fixtures";

describe("package coverage comparison", () => {
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

        expect(regressions).toContain("example: covered source disappeared: packages/features/example/src/covered.ts");
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

    test("allows a covered path to leave the baseline only when Git records a delete or rename", () => {
        const changes = [
            "D\tpackages/features/example/src/covered.ts",
            "R100\tpackages/features/example/src/old.ts\tpackages/features/example/src/new.ts",
            "M\tpackages/features/example/src/modified.ts",
        ].join("\n");
        const removed = parseRemovedOrRenamedPaths(changes);
        expect(removed).toEqual(
            new Set(["packages/features/example/src/covered.ts", "packages/features/example/src/old.ts"]),
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
            packageCoverage({ uncoveredSourceFiles: [uncoveredDestination] }),
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
            isPackageRemovalAllowed("packages/features/example", new Set(["packages/features/example/package.json"])),
        ).toBeTrue();
        expect(
            isPackageRemovalAllowed("packages/features/example", new Set(["packages/features/example/src/index.ts"])),
        ).toBeFalse();
        expect(
            comparePackageCoverage(
                packageCoverage(),
                packageCoverage({ path: "packages/features/renamed-example" }),
                "example",
                new Set(["packages/features/example/package.json"]),
            ),
        ).not.toContain("example: path changed from packages/features/example to packages/features/renamed-example");
    });
});
