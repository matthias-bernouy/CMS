import { describe, expect, test } from "bun:test";
import {
    compareCoverageBaselines,
    compareExactPackageCoverage,
    parseRemovedOrRenamedPaths,
    parseRenamedSourcesByDestination,
    type CoverageBaseline,
} from "../coverage-ratchet";
import { packageCoverage } from "./coverage-fixtures";

describe("coverage baseline comparison", () => {
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
});
