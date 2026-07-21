import { isPackageSourceFile } from "./paths";
import type { CoverageBaseline, CoverageMetric, PackageCoverage } from "./types";

function assertMetric(metric: CoverageMetric, label: string): void {
    if (
        !Number.isSafeInteger(metric.covered)
        || !Number.isSafeInteger(metric.total)
        || metric.covered < 0
        || metric.total < 0
        || metric.covered > metric.total
    ) {
        throw new Error(`Invalid coverage metric for ${label}`);
    }
}

function assertSourceFiles(coverage: PackageCoverage, label: string): void {
    for (const [kind, paths] of [
        ["coveredSourceFiles", coverage.coveredSourceFiles],
        ["uncoveredSourceFiles", coverage.uncoveredSourceFiles],
    ] as const) {
        if (!Array.isArray(paths) || paths.some((path) => typeof path !== "string")) {
            throw new Error(`${label}.${kind} must be a string array`);
        }
        if (JSON.stringify(paths) !== JSON.stringify([...new Set(paths)].sort())) {
            throw new Error(`${label}.${kind} must be sorted and unique`);
        }
        if (paths.some((path) => !isPackageSourceFile(path, coverage.path))) {
            throw new Error(`${label}.${kind} contains a path outside the package`);
        }
    }
    const covered = new Set(coverage.coveredSourceFiles);
    if (coverage.uncoveredSourceFiles.some((path) => covered.has(path))) {
        throw new Error(`${label} lists a source file as both covered and uncovered`);
    }
    if (
        coverage.files.covered !== coverage.coveredSourceFiles.length
        || coverage.files.total !== coverage.coveredSourceFiles.length + coverage.uncoveredSourceFiles.length
    ) {
        throw new Error(`${label}.files does not match its exact source-file lists`);
    }
}

export function validateBaseline(value: unknown): asserts value is CoverageBaseline {
    if (!value || typeof value !== "object") throw new Error("Coverage baseline must be an object");
    const baseline = value as Partial<CoverageBaseline>;
    if (baseline.schemaVersion !== 1) throw new Error("Unsupported coverage baseline schema");
    if (typeof baseline.bunVersion !== "string") throw new Error("Coverage baseline has no Bun version");
    if (!baseline.packages || typeof baseline.packages !== "object") {
        throw new Error("Coverage baseline has no package map");
    }
    for (const [name, coverage] of Object.entries(baseline.packages)) {
        if (!coverage || typeof coverage.path !== "string") {
            throw new Error(`Invalid coverage baseline for ${name}`);
        }
        assertMetric(coverage.files, `${name}.files`);
        assertMetric(coverage.functions, `${name}.functions`);
        assertMetric(coverage.lines, `${name}.lines`);
        assertSourceFiles(coverage, name);
    }
}

export function parseBaseline(contents: string, label: string): CoverageBaseline {
    let baseline: unknown;
    try {
        baseline = JSON.parse(contents) as unknown;
    } catch {
        throw new Error(`${label} is not valid JSON`);
    }
    validateBaseline(baseline);
    return baseline;
}
