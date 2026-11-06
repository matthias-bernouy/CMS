import { compareCoverageBaselines, compareExactPackageCoverage } from "./comparison";
import { git, parseRemovedOrRenamedPaths, parseRenamedSourcesByDestination, readReferenceBaseline } from "./git";
import type { CoverageBaseline } from "../types";
import { REPOSITORY_ROOT } from "../paths";
import { join } from "node:path";

function comparePackagesExactly(baseline: CoverageBaseline, measured: CoverageBaseline, label: string): string[] {
    return Object.entries(baseline.packages).flatMap(([name, coverage]) =>
        compareExactPackageCoverage(coverage, measured.packages[name]!, `${label}/${name}`),
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
            : compareExactPackageCoverage(coverage, measured.packages[name]!, `new package/${name}`),
    );
}

export function compareWithReference(
    referenceName: string,
    baseline: CoverageBaseline,
    measured: CoverageBaseline,
    repositoryRoot = REPOSITORY_ROOT,
): string[] {
    const toolchainChanges = git(
        ["diff", "--name-only", `${referenceName}...HEAD`, "--", ".bun-version"],
        repositoryRoot,
    );
    if (toolchainChanges.exitCode !== 0) {
        throw new Error(toolchainChanges.stderr.trim() || `Cannot inspect Bun version changes from ${referenceName}`);
    }
    if (isCoverageRuntimeMigration(toolchainChanges.stdout)) {
        return [];
    }

    const runtime = git(["show", `${referenceName}:.bun-version`], repositoryRoot);
    if (runtime.exitCode === 0 && runtime.stdout.trim() === baseline.bunVersion) {
        const previous = git(["show", `${referenceName}:quality/ci/coverage/baseline.json`], repositoryRoot);
        if (previous.exitCode === 0) {
            const version = (JSON.parse(previous.stdout) as { bunVersion?: unknown } | null)?.bunVersion;
            // Obsolete runtime measurements may also contain stale file counts.
            // Replace them only with the complete, exact current measurement.
            if (typeof version === "string" && version !== baseline.bunVersion) {
                return comparePackagesExactly(baseline, measured, "reconciled runtime baseline");
            }
        }
    }

    const reference = readReferenceBaseline(
        referenceName,
        repositoryRoot,
        join(repositoryRoot, "quality/ci/coverage/baseline.json"),
    );
    if (!reference) {
        return comparePackagesExactly(baseline, measured, "initial baseline");
    }

    if (reference.bunVersion !== baseline.bunVersion) {
        return [
            `target branch baseline uses Bun ${reference.bunVersion}, current baseline uses ${baseline.bunVersion}`,
        ];
    }

    const regressions: string[] = [];
    const changes = git(
        ["diff", "--name-status", "--find-renames", `${referenceName}...HEAD`, "--", "packages"],
        repositoryRoot,
    );
    if (changes.exitCode !== 0) {
        throw new Error(changes.stderr.trim() || `Cannot inspect source removals from ${referenceName}`);
    }
    regressions.push(
        ...compareCoverageBaselines(
            reference,
            baseline,
            "committed baseline",
            parseRemovedOrRenamedPaths(changes.stdout),
            parseRenamedSourcesByDestination(changes.stdout),
        ),
    );
    regressions.push(...compareNewPackages(reference, baseline, measured));
    return regressions;
}

export function isCoverageRuntimeMigration(changedPaths: string): boolean {
    return changedPaths
        .split(/\r?\n/)
        .map((path) => path.trim())
        .includes(".bun-version");
}
