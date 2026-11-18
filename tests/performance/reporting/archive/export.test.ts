import { expect, test } from "bun:test";
import { readFile, mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { reportFixture } from "../../fixtures/report";
import { compareReports } from "../compare";
import { writeRun, readRun } from "../history";
import { referenceDigest } from "../storage/export";
import { runId } from "../../harness/measurements/provenance";
import { sourceFixture, completeMeasurementFixture } from "./fixtures";
import { verifySourceSnapshot } from "./source";
import { exportAssessment, referenceEligibility } from "./export";
import { verifyAssessmentExport } from "./verify";

test("portable assessments keep the sealed run and exact dirty source together and refuse existing exports or mismatched source", async () => {
    const fixture = await sourceFixture();
    try {
        const report = await reportFixture();
        const snapshot = fixture.snapshot;
        const id = runId(snapshot.revision);
        const candidate = {
            ...report,
            metadata: {
                ...report.metadata,
                id,
                revision: snapshot.revision,
                sourceDigest: snapshot.sourceDigest,
                dirty: true,
                sourceArchive: { archiveSha256: snapshot.archiveSha256, manifestSha256: snapshot.manifestSha256 },
            },
        };
        const workspace = join(fixture.root, "candidate");
        const runRoot = join(workspace, "artifacts/performance/runs");
        await writeRun(runRoot, candidate, compareReports(candidate, candidate));
        const destination = join(fixture.root, "exports");
        const exported = await exportAssessment(workspace, id, destination, fixture.sourceRoot);
        expect(exported.referenceEligible).toBe(false);
        expect(exported.sourceArchivePinVerified).toBe(true);
        expect((await verifyAssessmentExport(exported.path, exported.sealSha256)).sourceArchivePinVerified).toBe(true);
        await expect(verifyAssessmentExport(exported.path, "0".repeat(64))).rejects.toThrow("seal or source identity");
        expect(exported.sourceDigest).toBe(snapshot.sourceDigest);
        expect(exported.sourceArchiveSha256).toBe(snapshot.archiveSha256);
        expect(await referenceDigest(join(exported.path, "runs"), id)).toBe(await referenceDigest(runRoot, id));
        expect((await readRun(join(exported.path, "runs"), id)).metadata).toEqual(candidate.metadata);
        const copy = await verifySourceSnapshot(join(exported.path, "sources", snapshot.sourceDigest));
        expect(copy.files).toBe(snapshot.files);
        expect(copy.archiveSha256).toBe(snapshot.archiveSha256);
        expect(JSON.parse(await readFile(join(exported.path, "export.json"), "utf8")).sealSha256).toBe(
            exported.sealSha256,
        );
        await expect(exportAssessment(workspace, id, destination, fixture.sourceRoot)).rejects.toThrow();
        const proofPath = join(exported.path, "export.json");
        const originalProof = await readFile(proofPath);
        const proof = JSON.parse(originalProof.toString());
        await writeFile(proofPath, JSON.stringify({ ...proof, results: { ...proof.results, covered: 999 } }));
        await expect(verifyAssessmentExport(exported.path)).rejects.toThrow("summary differs");
        await writeFile(proofPath, originalProof);
        const forged = {
            ...candidate,
            findings: [],
            coverage: candidate.coverage.map((row) => ({ ...row, status: "covered" as const })),
        };
        expect(referenceEligibility(forged, true)).toBe(false);
        const incomplete = join(fixture.root, "incomplete");
        await mkdir(join(incomplete, id), { recursive: true });
        await expect(exportAssessment(workspace, id, incomplete, fixture.sourceRoot)).rejects.toThrow();
        const changed = {
            ...candidate,
            metadata: { ...candidate.metadata, id: runId(snapshot.revision), revision: "0".repeat(40) },
        };
        await writeRun(runRoot, changed);
        await expect(exportAssessment(workspace, changed.metadata.id, destination, fixture.sourceRoot)).rejects.toThrow(
            "identity differ",
        );
        const wrongPin = {
            ...candidate,
            metadata: {
                ...candidate.metadata,
                id: runId(snapshot.revision),
                sourceArchive: { archiveSha256: "0".repeat(64), manifestSha256: snapshot.manifestSha256 },
            },
        };
        await writeRun(runRoot, wrongPin);
        await expect(
            exportAssessment(workspace, wrongPin.metadata.id, destination, fixture.sourceRoot),
        ).rejects.toThrow("immutable report pin");
    } finally {
        await fixture.close();
    }
}, 30_000);

test("an initial complete measured baseline may retain bad budgets while missing evidence and shared-host conditions prevent eligibility", async () => {
    const report = await completeMeasurementFixture();
    expect(referenceEligibility(report, true)).toBe(true);
    expect(referenceEligibility(report, false)).toBe(false);
    const missing = { ...report, results: report.results.slice(1) };
    expect(referenceEligibility(missing, true)).toBe(false);
    const contaminated = {
        ...report,
        findings: [...report.findings, { code: "measurement-contaminated", message: "Shared host" }],
    };
    expect(referenceEligibility(contaminated, true)).toBe(false);
    const noLoad = { ...report, results: report.results.map((result) => ({ ...result, load: undefined })) };
    expect(referenceEligibility(noLoad, true)).toBe(false);
});
