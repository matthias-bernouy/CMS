import { appendFile, mkdir, mkdtemp, readFile, readdir, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, relative, resolve, sep } from "node:path";

export type CoverageMetric = {
    covered: number;
    total: number;
};

export type PackageCoverage = {
    path: string;
    coveredSourceFiles: string[];
    uncoveredSourceFiles: string[];
    files: CoverageMetric;
    functions: CoverageMetric;
    lines: CoverageMetric;
};

export type CoveragePackage = {
    name: string;
    path: string;
    hasTests: boolean;
};

export type CoverageBaseline = {
    schemaVersion: 1;
    bunVersion: string;
    packages: Record<string, PackageCoverage>;
};

type LcovRecord = {
    sourceFile?: string;
    functionsFound: number;
    functionsHit: number;
    linesFound: number;
    linesHit: number;
};

const REPOSITORY_ROOT = resolve(import.meta.dir, "../..");
const BASELINE_PATH = join(import.meta.dir, "coverage-baseline.json");
const REPORT_DIRECTORY = join(REPOSITORY_ROOT, "coverage");
const SOURCE_EXTENSIONS = new Set([".cjs", ".js", ".jsx", ".mjs", ".ts", ".tsx"]);
const SKIPPED_DIRECTORIES = new Set(["coverage", "dist", "node_modules", "tests"]);

function normalizePath(path: string): string {
    return path.split(sep).join("/").replace(/^\.\//, "");
}

function extensionOf(path: string): string {
    const match = /\.[^.\/]+$/.exec(path);
    return match?.[0] ?? "";
}

function isPackageSourceFile(path: string, packagePath: string): boolean {
    const normalizedPath = normalizePath(path);
    const normalizedPackagePath = normalizePath(packagePath);
    if (!normalizedPath.startsWith(`${normalizedPackagePath}/`)) return false;
    if (normalizedPath.endsWith(".d.ts")) return false;
    if (!SOURCE_EXTENSIONS.has(extensionOf(normalizedPath))) return false;
    const relativePath = normalizedPath.slice(normalizedPackagePath.length + 1);
    return !relativePath.split("/").some((segment) => SKIPPED_DIRECTORIES.has(segment));
}

export function parseLcov(lcov: string, packagePath: string): Pick<PackageCoverage, "functions" | "lines"> & {
    coveredFiles: Set<string>;
} {
    const records: LcovRecord[] = [];
    let current: LcovRecord = {
        functionsFound: 0,
        functionsHit: 0,
        linesFound: 0,
        linesHit: 0,
    };

    const finishRecord = () => {
        if (current.sourceFile && isPackageSourceFile(current.sourceFile, packagePath)) {
            records.push(current);
        }
        current = {
            functionsFound: 0,
            functionsHit: 0,
            linesFound: 0,
            linesHit: 0,
        };
    };

    for (const line of lcov.split(/\r?\n/)) {
        const separator = line.indexOf(":");
        const key = separator === -1 ? line : line.slice(0, separator);
        const value = separator === -1 ? "" : line.slice(separator + 1);
        switch (key) {
            case "SF":
                current.sourceFile = normalizePath(value);
                break;
            case "FNF":
                current.functionsFound = Number.parseInt(value, 10);
                break;
            case "FNH":
                current.functionsHit = Number.parseInt(value, 10);
                break;
            case "LF":
                current.linesFound = Number.parseInt(value, 10);
                break;
            case "LH":
                current.linesHit = Number.parseInt(value, 10);
                break;
            case "end_of_record":
                finishRecord();
                break;
        }
    }

    return {
        coveredFiles: new Set(records.map((record) => record.sourceFile!)),
        functions: {
            covered: records.reduce((total, record) => total + record.functionsHit, 0),
            total: records.reduce((total, record) => total + record.functionsFound, 0),
        },
        lines: {
            covered: records.reduce((total, record) => total + record.linesHit, 0),
            total: records.reduce((total, record) => total + record.linesFound, 0),
        },
    };
}

export function isCoverageRegression(baseline: CoverageMetric, actual: CoverageMetric): boolean {
    if (baseline.total === 0) return false;
    if (actual.total === 0) return baseline.covered > 0;
    return actual.covered * baseline.total < baseline.covered * actual.total;
}

function assertMetric(metric: CoverageMetric, label: string): void {
    if (
        !Number.isSafeInteger(metric.covered) ||
        !Number.isSafeInteger(metric.total) ||
        metric.covered < 0 ||
        metric.total < 0 ||
        metric.covered > metric.total
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
        const sortedUniquePaths = [...new Set(paths)].sort();
        if (JSON.stringify(paths) !== JSON.stringify(sortedUniquePaths)) {
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
        coverage.files.covered !== coverage.coveredSourceFiles.length ||
        coverage.files.total !== coverage.coveredSourceFiles.length + coverage.uncoveredSourceFiles.length
    ) {
        throw new Error(`${label}.files does not match its exact source-file lists`);
    }
}

function validateBaseline(value: unknown): asserts value is CoverageBaseline {
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

export function assertEveryPackageHasTests(packages: CoveragePackage[]): void {
    const missingTests = packages.filter((packageInfo) => !packageInfo.hasTests).map((packageInfo) => packageInfo.name);
    if (missingTests.length > 0) {
        throw new Error(`Coverage requires a tests directory for every package; missing: ${missingTests.join(", ")}`);
    }
}

export function parseRemovedOrRenamedPaths(nameStatus: string): Set<string> {
    const removed = new Set<string>();
    for (const line of nameStatus.split(/\r?\n/)) {
        if (!line) continue;
        const [status, firstPath] = line.split("\t");
        if (firstPath && (status === "D" || status?.startsWith("R"))) removed.add(normalizePath(firstPath));
    }
    return removed;
}

export function parseRenamedSourcesByDestination(nameStatus: string): Map<string, string> {
    const renamed = new Map<string, string>();
    for (const line of nameStatus.split(/\r?\n/)) {
        if (!line) continue;
        const [status, sourcePath, destinationPath] = line.split("\t");
        if (status?.startsWith("R") && sourcePath && destinationPath) {
            renamed.set(normalizePath(destinationPath), normalizePath(sourcePath));
        }
    }
    return renamed;
}

export function isPackageRemovalAllowed(packagePath: string, removedOrRenamedPaths: ReadonlySet<string>): boolean {
    return removedOrRenamedPaths.has(`${normalizePath(packagePath)}/package.json`);
}

export function assertBaselineUpdateAllowed(updateBaseline: boolean, ci: string | undefined): void {
    if (updateBaseline && ci?.toLowerCase() === "true") {
        throw new Error("Coverage baseline updates are forbidden in CI");
    }
}

export function normalizeCoverageReference(reference: string | undefined): string | undefined {
    const normalized = reference?.trim();
    if (!normalized || /^0+$/.test(normalized)) return undefined;
    return normalized;
}

export function resolveCoverageReference(
    reference: string | undefined,
    ci: string | undefined,
): string | undefined {
    return normalizeCoverageReference(reference) ?? (ci?.toLowerCase() === "true" ? "HEAD^" : undefined);
}

async function pathExists(path: string): Promise<boolean> {
    try {
        await stat(path);
        return true;
    } catch (error) {
        if ((error as NodeJS.ErrnoException).code === "ENOENT") return false;
        throw error;
    }
}

async function collectSourceFiles(root: string, packagePath: string): Promise<Set<string>> {
    const sourceFiles = new Set<string>();

    async function visit(directory: string): Promise<void> {
        for (const entry of await readdir(directory, { withFileTypes: true })) {
            if (entry.isDirectory() && SKIPPED_DIRECTORIES.has(entry.name)) continue;
            const absolutePath = join(directory, entry.name);
            if (entry.isDirectory()) {
                await visit(absolutePath);
            } else {
                const repositoryPath = normalizePath(relative(REPOSITORY_ROOT, absolutePath));
                if (isPackageSourceFile(repositoryPath, packagePath)) sourceFiles.add(repositoryPath);
            }
        }
    }

    await visit(root);
    return sourceFiles;
}

async function discoverPackages(): Promise<CoveragePackage[]> {
    const packages: CoveragePackage[] = [];
    for (const layerEntry of await readdir(join(REPOSITORY_ROOT, "packages"), { withFileTypes: true })) {
        if (!layerEntry.isDirectory()) continue;
        const layerPath = join(REPOSITORY_ROOT, "packages", layerEntry.name);
        for (const packageEntry of await readdir(layerPath, { withFileTypes: true })) {
            if (!packageEntry.isDirectory()) continue;
            const packageRoot = join(layerPath, packageEntry.name);
            const manifest = JSON.parse(await readFile(join(packageRoot, "package.json"), "utf8")) as {
                name?: unknown;
            };
            if (typeof manifest.name !== "string") {
                throw new Error(`Package at ${relative(REPOSITORY_ROOT, packageRoot)} has no name`);
            }
            packages.push({
                name: manifest.name,
                path: normalizePath(relative(REPOSITORY_ROOT, packageRoot)),
                hasTests: await pathExists(join(packageRoot, "tests")),
            });
        }
    }
    const sortedPackages = packages.sort((left, right) => left.name.localeCompare(right.name));
    assertEveryPackageHasTests(sortedPackages);
    return sortedPackages;
}

async function measurePackage(
    packageInfo: CoveragePackage,
    temporaryRoot: string,
): Promise<PackageCoverage> {
    const outputDirectory = join(temporaryRoot, packageInfo.name.replace(/[^a-z0-9]+/gi, "-"));
    const testProcess = Bun.spawn(
        [
            process.execPath,
            "test",
            `${packageInfo.path}/tests`,
            "--coverage",
            "--coverage-reporter=lcov",
            `--coverage-dir=${outputDirectory}`,
        ],
        {
            cwd: REPOSITORY_ROOT,
            env: { ...process.env, CI: "true" },
            stdout: "pipe",
            stderr: "pipe",
        },
    );
    const stdout = new Response(testProcess.stdout).text();
    const stderr = new Response(testProcess.stderr).text();
    const exitCode = await testProcess.exited;
    const [testOutput, testErrors] = await Promise.all([stdout, stderr]);
    if (exitCode !== 0) {
        process.stdout.write(testOutput);
        process.stderr.write(testErrors);
        throw new Error(`Coverage tests failed for ${packageInfo.name}`);
    }
    console.log(`Coverage tests passed for ${packageInfo.name}`);

    const parsed = parseLcov(await readFile(join(outputDirectory, "lcov.info"), "utf8"), packageInfo.path);
    const sourceFiles = await collectSourceFiles(join(REPOSITORY_ROOT, packageInfo.path), packageInfo.path);
    const coveredSourceFiles = [...parsed.coveredFiles].filter((path) => sourceFiles.has(path)).sort();
    const uncoveredSourceFiles = [...sourceFiles].filter((path) => !parsed.coveredFiles.has(path)).sort();
    return {
        path: packageInfo.path,
        coveredSourceFiles,
        uncoveredSourceFiles,
        files: { covered: coveredSourceFiles.length, total: sourceFiles.size },
        functions: parsed.functions,
        lines: parsed.lines,
    };
}

function percentage(metric: CoverageMetric): string {
    if (metric.total === 0) return "n/a";
    return `${((metric.covered / metric.total) * 100).toFixed(2)}%`;
}

function report(packages: Record<string, PackageCoverage>): string {
    const rows = [
        "| Package | Files | Lines | Functions |",
        "|---|---:|---:|---:|",
        ...Object.entries(packages).map(
            ([name, coverage]) =>
                `| ${name} | ${percentage(coverage.files)} | ${percentage(coverage.lines)} | ${percentage(coverage.functions)} |`,
        ),
    ];
    return ["## Per-package coverage", "", ...rows, ""].join("\n");
}

function parseBaseline(contents: string, label: string): CoverageBaseline {
    let baseline: unknown;
    try {
        baseline = JSON.parse(contents) as unknown;
    } catch {
        throw new Error(`${label} is not valid JSON`);
    }
    validateBaseline(baseline);
    return baseline;
}

function git(args: string[]): { exitCode: number; stdout: string; stderr: string } {
    const result = Bun.spawnSync(["git", ...args], {
        cwd: REPOSITORY_ROOT,
        stdout: "pipe",
        stderr: "pipe",
    });
    return {
        exitCode: result.exitCode,
        stdout: result.stdout.toString(),
        stderr: result.stderr.toString(),
    };
}

function readReferenceBaseline(reference: string): CoverageBaseline | undefined {
    const commit = git(["cat-file", "-e", `${reference}^{commit}`]);
    if (commit.exitCode !== 0) throw new Error(`Coverage baseline reference is not a commit: ${reference}`);

    const baselineRepositoryPath = normalizePath(relative(REPOSITORY_ROOT, BASELINE_PATH));
    const show = git(["show", `${reference}:${baselineRepositoryPath}`]);
    if (show.exitCode === 0) return parseBaseline(show.stdout, `Coverage baseline at ${reference}`);

    const tree = git(["ls-tree", "-r", "--name-only", reference, "--", baselineRepositoryPath]);
    if (tree.exitCode !== 0) throw new Error(tree.stderr.trim() || `Cannot inspect coverage baseline at ${reference}`);
    if (tree.stdout.trim().length === 0) return undefined;
    throw new Error(show.stderr.trim() || `Cannot read coverage baseline at ${reference}`);
}

export function compareExactPackageCoverage(
    expected: PackageCoverage,
    actual: PackageCoverage,
    label: string,
): string[] {
    const exact = expected.path === actual.path
        && JSON.stringify(expected.coveredSourceFiles) === JSON.stringify(actual.coveredSourceFiles)
        && JSON.stringify(expected.uncoveredSourceFiles) === JSON.stringify(actual.uncoveredSourceFiles)
        && (["files", "functions", "lines"] as const).every(
            (metric) => expected[metric].covered === actual[metric].covered
                && expected[metric].total === actual[metric].total,
        );
    return exact ? [] : [`${label}: committed coverage must exactly match the measured package snapshot`];
}

function findRenamedPackage(
    expectedPath: string,
    actual: CoverageBaseline,
    renamedSourcesByDestination: ReadonlyMap<string, string>,
): [string, PackageCoverage] | undefined {
    const normalizedExpectedPath = normalizePath(expectedPath);
    const samePath = Object.entries(actual.packages).find(([, coverage]) => coverage.path === normalizedExpectedPath);
    if (samePath) return samePath;

    const expectedManifest = `${normalizedExpectedPath}/package.json`;
    for (const [destination, source] of renamedSourcesByDestination) {
        if (source !== expectedManifest || !destination.endsWith("/package.json")) continue;
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
    renamedSourcesByDestination: ReadonlyMap<string, string> = new Map(),
): string[] {
    const regressions: string[] = [];
    for (const [name, expectedCoverage] of Object.entries(baseline.packages)) {
        const renamedPackage = findRenamedPackage(expectedCoverage.path, actual, renamedSourcesByDestination);
        const actualCoverage = actual.packages[name] ?? renamedPackage?.[1];
        if (!actualCoverage) {
            if (!isPackageRemovalAllowed(expectedCoverage.path, allowedCoveredRemovals)) {
                regressions.push(`${label}: tested package disappeared: ${name}`);
            }
            continue;
        }
        const comparisonLabel = renamedPackage && !actual.packages[name]
            ? `${label}/${name} -> ${renamedPackage[0]}`
            : `${label}/${name}`;
        regressions.push(
            ...comparePackageCoverage(
                expectedCoverage,
                actualCoverage,
                comparisonLabel,
                allowedCoveredRemovals,
                renamedSourcesByDestination,
            ),
        );
    }
    return regressions;
}

async function main(): Promise<void> {
    const updateBaseline = process.argv.includes("--update");
    if (process.argv.some((argument) => argument.startsWith("--") && argument !== "--update")) {
        throw new Error("Usage: bun run quality/ci/coverage-ratchet.ts [--update]");
    }
    assertBaselineUpdateAllowed(updateBaseline, process.env.CI);

    const packageInfos = await discoverPackages();
    const temporaryRoot = await mkdtemp(join(tmpdir(), "cmscore-coverage-"));
    const measured: Record<string, PackageCoverage> = {};
    try {
        for (const packageInfo of packageInfos) {
            console.log(`\nMeasuring ${packageInfo.name}`);
            measured[packageInfo.name] = await measurePackage(packageInfo, temporaryRoot);
        }
    } finally {
        await rm(temporaryRoot, { recursive: true, force: true });
    }

    const markdown = report(measured);
    console.log(`\n${markdown}`);
    const measuredBaseline: CoverageBaseline = {
        schemaVersion: 1,
        bunVersion: Bun.version,
        packages: measured,
    };
    validateBaseline(measuredBaseline);
    await mkdir(REPORT_DIRECTORY, { recursive: true });
    await Promise.all([
        writeFile(join(REPORT_DIRECTORY, "summary.md"), markdown),
        writeFile(join(REPORT_DIRECTORY, "summary.json"), `${JSON.stringify(measuredBaseline, null, 4)}\n`),
    ]);
    if (process.env.GITHUB_STEP_SUMMARY) {
        await appendFile(process.env.GITHUB_STEP_SUMMARY, markdown);
    }

    if (updateBaseline) {
        await writeFile(BASELINE_PATH, `${JSON.stringify(measuredBaseline, null, 4)}\n`);
        console.log(`Updated ${relative(REPOSITORY_ROOT, BASELINE_PATH)}`);
        return;
    }

    const baseline = parseBaseline(await readFile(BASELINE_PATH, "utf8"), "Coverage baseline");
    if (baseline.bunVersion !== Bun.version) {
        throw new Error(`Coverage baseline requires Bun ${baseline.bunVersion}; running ${Bun.version}`);
    }

    const expectedNames = Object.keys(baseline.packages).sort();
    const actualNames = Object.keys(measured).sort();
    if (JSON.stringify(expectedNames) !== JSON.stringify(actualNames)) {
        throw new Error("Tested package set differs from the coverage baseline; regenerate it intentionally with --update");
    }

    const regressions = compareCoverageBaselines(baseline, measuredBaseline, "working tree");

    const reference = resolveCoverageReference(process.env.COVERAGE_BASELINE_REF, process.env.CI);
    if (reference) {
        const referenceBaseline = readReferenceBaseline(reference);
        if (referenceBaseline) {
            if (referenceBaseline.bunVersion !== baseline.bunVersion) {
                regressions.push(
                    `target branch baseline uses Bun ${referenceBaseline.bunVersion}, current baseline uses ${baseline.bunVersion}`,
                );
            }
            const changedPaths = git(["diff", "--name-status", "--find-renames", `${reference}...HEAD`, "--", "packages"]);
            if (changedPaths.exitCode !== 0) {
                throw new Error(changedPaths.stderr.trim() || `Cannot inspect source removals from ${reference}`);
            }
            const allowedCoveredRemovals = parseRemovedOrRenamedPaths(changedPaths.stdout);
            const renamedSourcesByDestination = parseRenamedSourcesByDestination(changedPaths.stdout);
            regressions.push(
                ...compareCoverageBaselines(
                    referenceBaseline,
                    baseline,
                    "committed baseline",
                    allowedCoveredRemovals,
                    renamedSourcesByDestination,
                ),
            );
            for (const [name, currentCoverage] of Object.entries(baseline.packages)) {
                if (referenceBaseline.packages[name]) continue;
                regressions.push(
                    ...compareExactPackageCoverage(
                        currentCoverage,
                        measuredBaseline.packages[name]!,
                        `new package/${name}`,
                    ),
                );
            }
        } else {
            for (const [name, currentCoverage] of Object.entries(baseline.packages)) {
                regressions.push(
                    ...compareExactPackageCoverage(
                        currentCoverage,
                        measuredBaseline.packages[name]!,
                        `initial baseline/${name}`,
                    ),
                );
            }
        }
    }
    if (regressions.length > 0) {
        throw new Error(`Coverage regressions:\n- ${regressions.join("\n- ")}`);
    }
}

if (import.meta.main) {
    await main();
}
