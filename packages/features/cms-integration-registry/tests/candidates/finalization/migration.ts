import {
    identifyStatefulChangeSelection,
    type AdmissionInputSnapshotV1,
    type MigrationReport,
} from "@bernouy/cms-integration-verification";

export async function passedMigrationReport(
    selection: Awaited<ReturnType<typeof identifyStatefulChangeSelection>>["selection"],
    runner: AdmissionInputSnapshotV1["selectedRunner"],
): Promise<MigrationReport> {
    const requirement = selection.requiredMigrations[0];
    if (!requirement) {
        throw new Error("Expected a selected migration requirement");
    }
    const passed = { outcome: "passed" as const, evidenceDigest: "e".repeat(64) };
    return {
        schema: "cms.integration.migration-report.v1",
        reportId: "migration-candidate-stateful-finalization",
        revisionType: "root",
        origin: "admission",
        createdAt: "2026-07-26T10:00:05.000Z",
        source: requirement.source,
        target: selection.target,
        connectorKey: requirement.connectorKey,
        lineageId: requirement.lineageId,
        migrationRevision: 1,
        supportedSourceRange: "^1.0.0",
        runner,
        policy: selection.selector,
        policySnapshotDigest: selection.policySnapshotDigest,
        migrationInputDigest: "a".repeat(64),
        migrationJobResultDigest: "b".repeat(64),
        statefulChangeSelectionDigest: (await identifyStatefulChangeSelection(selection)).digest,
        environmentDigest: "c".repeat(64),
        checks: {
            freshInstall: passed,
            migratedState: passed,
            equivalence: passed,
            failureInjection: { outcome: "not-supported" },
            resumption: { outcome: "not-supported" },
        },
        cutover: { cmsMediated: "binding-revision", providerDirect: "expand-in-code" },
        rollback: "unavailable",
        pointOfNoReturn: "cleanup",
        delayedCleanupVerified: true,
        outcome: "passed",
        provenance: { actor: "repository-verifier", reason: "candidate-admission" },
    };
}
