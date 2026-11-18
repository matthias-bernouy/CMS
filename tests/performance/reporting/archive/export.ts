import { createHash } from "node:crypto";
import { mkdir, mkdtemp, rename, rm, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { readRun } from "../history";
import { exportRun, referenceDigest } from "../storage/export";
import { realDirectory, regularBytes } from "../storage/io";
import { verifySourceSnapshot } from "./source";
import { compareReports } from "../compare";
import { selectedObligations, selectionFindings } from "../scope";
import type { RunReport } from "../types";
import { auditPlan, auditExecution, coverageMatrix } from "../../capabilities/coverage";
import { auditBudgets } from "../../capabilities/budgets";

const sha = (value: Uint8Array) => createHash("sha256").update(value).digest("hex");

export function assessmentCounts(report: RunReport) {
    return {
        scenarios: report.results.length,
        passed: report.results.filter((row) => row.status === "passed").length,
        failed: report.results.filter((row) => row.status === "failed").length,
        blocked: report.results.filter((row) => row.status === "blocked").length,
        covered: report.coverage.filter((row) => row.status === "covered").length,
        required: report.coverage.length,
        budgetFindings: report.findings.filter((row) => row.code === "budget-exceeded").length,
    };
}

/** Initial baselines may exceed budgets; eligibility requires complete, comparable measurement evidence. */
export function referenceEligibility(report: RunReport, pinned: boolean) {
    if (!pinned) {
        return false;
    }
    const required = selectedObligations(report.metadata, report.scenarios);
    const coverage = coverageMatrix(report.inventory, report.scenarios, report.results, required);
    const allowed = [
        "missing-reference",
        "budget-exceeded",
        "throughput-budget-exceeded",
        "latency-regression",
        "work-regression",
    ];
    const findings = [
        ...report.findings,
        ...selectionFindings(report.metadata, report.scenarios),
        ...auditPlan(report.inventory, report.scenarios, required),
        ...auditExecution(report.scenarios, report.results, coverage),
        ...auditBudgets(report.scenarios, report.results),
    ];
    return (
        pinned &&
        report.scenarios.length > 0 &&
        report.coverage.length > 0 &&
        report.results.length === report.scenarios.length &&
        report.results.every((row) => row.status === "passed") &&
        report.coverage.every((row) => row.status === "covered") &&
        compareReports(report, report).comparable &&
        findings.every((row) => allowed.includes(row.code))
    );
}

/** Export immutable measurements and their verified exact source together; publication never promotes a reference. */
export async function exportAssessment(
    workspace: string,
    id: string,
    destination: string,
    sourceRoot = join(workspace, "artifacts/performance/source-snapshots"),
) {
    const root = join(workspace, "artifacts/performance/runs");
    const report = await readRun(root, id);
    const digest = report.metadata.sourceDigest;
    if (!/^[a-f0-9]{64}$/u.test(digest)) {
        throw new Error("Invalid source identity");
    }
    const source = join(sourceRoot, digest);
    const snapshot = await verifySourceSnapshot(source);
    if (snapshot.sourceDigest !== digest || snapshot.revision !== report.metadata.revision) {
        throw new Error("Source archive and report identity differ");
    }
    const pin = report.metadata.sourceArchive;
    if (pin && (pin.archiveSha256 !== snapshot.archiveSha256 || pin.manifestSha256 !== snapshot.manifestSha256)) {
        throw new Error("Source archive differs from the immutable report pin");
    }
    await mkdir(destination, { recursive: true, mode: 0o700 });
    await realDirectory(destination);
    // Exclusive reservation refuses even a pre-existing incomplete or empty export directory.
    const target = join(destination, id);
    await mkdir(target, { mode: 0o700 });
    const stage = await mkdtemp(join(destination, ".export-"));
    try {
        await exportRun(root, id, join(stage, "runs"));
        const copy = join(stage, "sources", digest);
        await mkdir(copy, { recursive: true, mode: 0o700 });
        for (const [name, limit] of [
            ["working-tree.tar.gz", 128 * 1024 ** 2],
            ["snapshot.json", 16 * 1024 ** 2],
            ["tracked.patch", 32 * 1024 ** 2],
            ["complete.json", 4096],
        ] as const) {
            await writeFile(join(copy, name), await regularBytes(join(source, name), limit), {
                flag: "wx",
                mode: 0o600,
            });
        }
        await verifySourceSnapshot(copy);
        const sealSha256 = await referenceDigest(join(stage, "runs"), id);
        const proof = {
            format: 1,
            id,
            sourceDigest: digest,
            revision: report.metadata.revision,
            sourceArchiveSha256: snapshot.archiveSha256,
            sourceManifestSha256: sha(await regularBytes(join(copy, "snapshot.json"), 16 * 1024 ** 2)),
            sealSha256,
            sourceArchivePinVerified: !!pin,
            ...(report.metadata.selection ? { selection: report.metadata.selection } : {}),
            referenceEligible: referenceEligibility(report, !!pin),
            conditions: report.findings.some((row) => row.code === "measurement-contaminated")
                ? "diagnostic-shared-host"
                : "recorded-report",
            results: assessmentCounts(report),
        };
        await writeFile(join(stage, "export.json"), JSON.stringify(proof, null, 2) + "\n", { flag: "wx", mode: 0o600 });
        await rename(stage, target);
        return { path: target, ...proof };
    } finally {
        await rm(stage, { recursive: true, force: true });
    }
}

if (import.meta.main) {
    const [workspace, id, destination, sourceRoot] = Bun.argv.slice(2);
    if (!workspace || !id || !destination) {
        throw new Error("Use export.ts <workspace> <run-id> <destination> [source-root]");
    }
    console.log(
        JSON.stringify(
            await exportAssessment(resolve(workspace), id, resolve(destination), sourceRoot && resolve(sourceRoot)),
        ),
    );
}
