import { compareCoverageBaselines, compareExactPackageCoverage } from "./comparison";
import {
    git,
    parseRemovedOrRenamedPaths,
    parseRenamedSourcesByDestination,
    readReferenceBaseline,
} from "./git";
import type { CoverageBaseline } from "../types";

function comparePackagesExactly(
    baseline: CoverageBaseline,
    measured: CoverageBaseline,
    label: string,
): string[] {
    return Object.entries(baseline.packages).flatMap(([name, coverage]) =>
        compareExactPackageCoverage(coverage, measured.packages[name]!, `${label}/${name}`)
    );
}

function compareNewPackages(
    reference: CoverageBaseline,
    baseline: CoverageBaseline,
    measured: CoverageBaseline,
): string[] {
    return Object.entries(baseline.packages).flatMap(([name, coverage]) =>
        reference.packages[name]
            ? []
            : compareExactPackageCoverage(coverage, measured.packages[name]!, `new package/${name}`)
    );
}

export function compareWithReference(
    referenceName: string,
    baseline: CoverageBaseline,
    measured: CoverageBaseline,
): string[] {
    const reference = readReferenceBaseline(referenceName);
    if (!reference) return comparePackagesExactly(baseline, measured, "initial baseline");

    const regressions: string[] = [];
    if (reference.bunVersion !== baseline.bunVersion) {
        regressions.push(
            `target branch baseline uses Bun ${reference.bunVersion}, current baseline uses ${baseline.bunVersion}`,
        );
    }
    const changes = git(["diff", "--name-status", "--find-renames", `${referenceName}...HEAD`, "--", "packages"]);
    if (changes.exitCode !== 0) {
        throw new Error(changes.stderr.trim() || `Cannot inspect source removals from ${referenceName}`);
    }
    regressions.push(...compareCoverageBaselines(
        reference,
        baseline,
        "committed baseline",
        parseRemovedOrRenamedPaths(changes.stdout),
        parseRenamedSourcesByDestination(changes.stdout),
    ));
    regressions.push(...compareNewPackages(reference, baseline, measured));
    return regressions;
}
