import { isPackageRemovalAllowed } from "./git";
import { normalizePath } from "../paths";
import type { CoverageBaseline, CoverageMetric, PackageCoverage } from "../types";

export function percentage(metric: CoverageMetric): string {
    if (metric.total === 0) {
        return "n/a";
    }
    return `${((metric.covered / metric.total) * 100).toFixed(2)}%`;
}

export function isCoverageRegression(baseline: CoverageMetric, actual: CoverageMetric): boolean {
    if (baseline.total === 0) {
        return false;
    }
    if (actual.total === 0) {
        return baseline.covered > 0;
    }
    return actual.covered * baseline.total < baseline.covered * actual.total;
}

export function comparePackageCoverage(
    baseline: PackageCoverage,
    actual: PackageCoverage,
    label: string,
    allowedCoveredRemovals: ReadonlySet<string> = new Set(),
    renamedSourcesByDestination: ReadonlyMap<string, string> = new Map(),
): string[] {
    const regressions: string[] = [];
    if (baseline.path !== actual.path && !isPackageRemovalAllowed(baseline.path, allowedCoveredRemovals)) {
        regressions.push(`${label}: path changed from ${baseline.path} to ${actual.path}`);
    }
    for (const metric of ["files", "functions", "lines"] as const) {
        if (isCoverageRegression(baseline[metric], actual[metric])) {
            regressions.push(
                `${label}: ${metric} decreased from ${percentage(baseline[metric])} to ${percentage(actual[metric])}`,
            );
        }
    }

    const actualCovered = new Set(actual.coveredSourceFiles);
    for (const path of baseline.coveredSourceFiles) {
        if (!actualCovered.has(path) && !allowedCoveredRemovals.has(path)) {
            regressions.push(`${label}: covered source disappeared: ${path}`);
        }
    }
    const acceptedUncovered = new Set(baseline.uncoveredSourceFiles);
    for (const path of actual.uncoveredSourceFiles) {
        const previousPath = renamedSourcesByDestination.get(path);
        if (!acceptedUncovered.has(path) && (!previousPath || !acceptedUncovered.has(previousPath))) {
            regressions.push(`${label}: newly uncovered source: ${path}`);
        }
    }
    return regressions;
}

export function compareExactPackageCoverage(
    expected: PackageCoverage,
    actual: PackageCoverage,
    label: string,
): string[] {
    const exact =
        expected.path === actual.path &&
        JSON.stringify(expected.coveredSourceFiles) === JSON.stringify(actual.coveredSourceFiles) &&
        JSON.stringify(expected.uncoveredSourceFiles) === JSON.stringify(actual.uncoveredSourceFiles) &&
        (["files", "functions", "lines"] as const).every(
            (metric) =>
                expected[metric].covered === actual[metric].covered && expected[metric].total === actual[metric].total,
        );
    return exact ? [] : [`${label}: committed coverage must exactly match the measured package snapshot`];
}

function findRenamedPackage(
    expectedPath: string,
    actual: CoverageBaseline,
    renamedSources: ReadonlyMap<string, string>,
): [string, PackageCoverage] | undefined {
    const normalizedPath = normalizePath(expectedPath);
    const samePath = Object.entries(actual.packages).find(([, coverage]) => coverage.path === normalizedPath);
    if (samePath) {
        return samePath;
    }

    const expectedManifest = `${normalizedPath}/package.json`;
    for (const [destination, source] of renamedSources) {
        if (source !== expectedManifest || !destination.endsWith("/package.json")) {
            continue;
        }
        const destinationPath = destination.slice(0, -"/package.json".length);
        return Object.entries(actual.packages).find(([, coverage]) => coverage.path === destinationPath);
    }
    return undefined;
}

export function compareCoverageBaselines(
    baseline: CoverageBaseline,
    actual: CoverageBaseline,
    label: string,
    allowedCoveredRemovals: ReadonlySet<string> = new Set(),
    renamedSources: ReadonlyMap<string, string> = new Map(),
): string[] {
    const regressions: string[] = [];
    for (const [name, expectedCoverage] of Object.entries(baseline.packages)) {
        const renamedPackage = findRenamedPackage(expectedCoverage.path, actual, renamedSources);
        const actualCoverage = actual.packages[name] ?? renamedPackage?.[1];
        if (!actualCoverage) {
            if (!isPackageRemovalAllowed(expectedCoverage.path, allowedCoveredRemovals)) {
                regressions.push(`${label}: tested package disappeared: ${name}`);
            }
            continue;
        }
        const comparisonLabel =
            renamedPackage && !actual.packages[name] ? `${label}/${name} -> ${renamedPackage[0]}` : `${label}/${name}`;
        regressions.push(
            ...comparePackageCoverage(
                expectedCoverage,
                actualCoverage,
                comparisonLabel,
                allowedCoveredRemovals,
                renamedSources,
            ),
        );
    }
    return regressions;
}
