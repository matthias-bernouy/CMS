import { expect, test } from "bun:test";
import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { reportFixture } from "../fixtures/report";
import { coverageMatrix } from "../capabilities/coverage";
import { assessmentReport } from "../assessment/report";
import { performancePlan } from "../command/planning";
import { writeRun } from "./history";
import { selectedObligations } from "./scope";
import { sourceFixture } from "./archive/fixtures";
import { exportAssessment } from "./archive/export";
import { verifyAssessmentExport } from "./archive/verify";

test("portable selected exports retain their exact scope and refuse a changed scope summary", async () => {
    const archive = await sourceFixture();
    try {
        const fixture = await reportFixture();
        const snapshot = archive.snapshot;
        const metadata = {
            ...fixture.metadata,
            revision: snapshot.revision,
            sourceDigest: snapshot.sourceDigest,
            sourceArchive: { archiveSha256: snapshot.archiveSha256, manifestSha256: snapshot.manifestSha256 },
            selection: {
                kind: "selected-scenarios" as const,
                scenarioIds: fixture.scenarios.map((row) => row.id),
                plannedScenarios: 10,
            },
        };
        const report = {
            ...fixture,
            metadata,
            findings: [],
            status: "passed" as const,
            coverage: coverageMatrix(
                fixture.inventory,
                fixture.scenarios,
                fixture.results,
                selectedObligations(metadata, fixture.scenarios),
            ),
        };
        const workspace = join(archive.root, "workspace");
        await writeRun(join(workspace, "artifacts/performance/runs"), report);
        const exported = await exportAssessment(
            workspace,
            metadata.id,
            join(archive.root, "exports"),
            archive.sourceRoot,
        );
        expect(exported.selection).toEqual(metadata.selection);
        expect(exported.referenceEligible).toBe(true);
        expect((await verifyAssessmentExport(exported.path)).sourceArchivePinVerified).toBe(true);
        const path = join(exported.path, "export.json");
        const proof = JSON.parse(await readFile(path, "utf8"));
        await writeFile(path, JSON.stringify({ ...proof, selection: undefined }));
        await expect(verifyAssessmentExport(exported.path)).rejects.toThrow("summary differs");
    } finally {
        await archive.close();
    }
}, 30_000);

test("large exact selections remain portable without treating missing measurements as complete", async () => {
    const archive = await sourceFixture();
    try {
        const fixture = await reportFixture();
        const plan = await performancePlan();
        const scenarios = plan.scenarios.map((row) => row.definition);
        const snapshot = archive.snapshot;
        const metadata = {
            ...fixture.metadata,
            revision: snapshot.revision,
            sourceDigest: snapshot.sourceDigest,
            sourceArchive: { archiveSha256: snapshot.archiveSha256, manifestSha256: snapshot.manifestSha256 },
            selection: {
                kind: "selected-scenarios" as const,
                scenarioIds: scenarios.map((row) => row.id),
                plannedScenarios: scenarios.length,
            },
        };
        const workspace = join(archive.root, "workspace");
        const history = join(workspace, "artifacts/performance/runs");
        const { report } = await assessmentReport(history, metadata, plan.inventory, scenarios, [], []);
        expect(report.status).toBe("failed");
        const exported = await exportAssessment(
            workspace,
            metadata.id,
            join(archive.root, "exports"),
            archive.sourceRoot,
        );
        expect((await readFile(join(exported.path, "export.json"))).byteLength).toBeGreaterThan(64 * 1024);
        expect(exported.referenceEligible).toBe(false);
        const verified = await verifyAssessmentExport(exported.path);
        expect(verified.sourceArchivePinVerified).toBe(true);
        expect(verified.referenceEligible).toBe(false);
    } finally {
        await archive.close();
    }
}, 30_000);
