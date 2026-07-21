import { appendFile, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, relative } from "node:path";
import { parseBaseline, validateBaseline } from "./measurement/baseline";
import { coverageReport, discoverPackages, measurePackage } from "./measurement/measurement";
import { BASELINE_PATH, REPORT_DIRECTORY, REPOSITORY_ROOT } from "./paths";
import { compareCoverageBaselines } from "./policy/comparison";
import { assertBaselineUpdateAllowed, resolveCoverageReference } from "./policy/policy";
import { compareWithReference } from "./policy/regression";
import type { CoverageBaseline, PackageCoverage } from "./types";

function parseArguments(): boolean {
    const updateBaseline = process.argv.includes("--update");
    if (process.argv.some((argument) => argument.startsWith("--") && argument !== "--update")) {
        throw new Error("Usage: bun run quality/ci/coverage/ratchet.ts [--update]");
    }
    return updateBaseline;
}

async function measureAllPackages(): Promise<Record<string, PackageCoverage>> {
    const temporaryRoot = await mkdtemp(join(tmpdir(), "cmscore-coverage-"));
    const measured: Record<string, PackageCoverage> = {};
    try {
        for (const packageInfo of await discoverPackages()) {
            console.log(`\nMeasuring ${packageInfo.name}`);
            measured[packageInfo.name] = await measurePackage(packageInfo, temporaryRoot);
        }
        return measured;
    } finally {
        await rm(temporaryRoot, { recursive: true, force: true });
    }
}

async function writeReports(baseline: CoverageBaseline, markdown: string): Promise<void> {
    await mkdir(REPORT_DIRECTORY, { recursive: true });
    await Promise.all([
        writeFile(join(REPORT_DIRECTORY, "summary.md"), markdown),
        writeFile(join(REPORT_DIRECTORY, "summary.json"), `${JSON.stringify(baseline, null, 4)}\n`),
    ]);
    if (process.env.GITHUB_STEP_SUMMARY) {
        await appendFile(process.env.GITHUB_STEP_SUMMARY, markdown);
    }
}

function assertPackageSet(baseline: CoverageBaseline, measured: CoverageBaseline): void {
    const expectedNames = Object.keys(baseline.packages).sort();
    const actualNames = Object.keys(measured.packages).sort();
    if (JSON.stringify(expectedNames) !== JSON.stringify(actualNames)) {
        throw new Error(
            "Tested package set differs from the coverage baseline; regenerate it intentionally with --update",
        );
    }
}

export async function runCoverageRatchet(): Promise<void> {
    const updateBaseline = parseArguments();
    assertBaselineUpdateAllowed(updateBaseline, process.env.CI);
    const measuredPackages = await measureAllPackages();
    const markdown = coverageReport(measuredPackages);
    console.log(`\n${markdown}`);
    const measured: CoverageBaseline = {
        schemaVersion: 1,
        bunVersion: Bun.version,
        packages: measuredPackages,
    };
    validateBaseline(measured);
    await writeReports(measured, markdown);

    if (updateBaseline) {
        await writeFile(BASELINE_PATH, `${JSON.stringify(measured, null, 4)}\n`);
        console.log(`Updated ${relative(REPOSITORY_ROOT, BASELINE_PATH)}`);
        return;
    }

    const baseline = parseBaseline(await readFile(BASELINE_PATH, "utf8"), "Coverage baseline");
    if (baseline.bunVersion !== Bun.version) {
        throw new Error(`Coverage baseline requires Bun ${baseline.bunVersion}; running ${Bun.version}`);
    }
    assertPackageSet(baseline, measured);
    const regressions = compareCoverageBaselines(baseline, measured, "working tree");
    const reference = resolveCoverageReference(process.env.COVERAGE_BASELINE_REF, process.env.CI);
    if (reference) {
        regressions.push(...compareWithReference(reference, baseline, measured));
    }
    if (regressions.length > 0) {
        throw new Error(`Coverage regressions:\n- ${regressions.join("\n- ")}`);
    }
}
