import type { RepositoryReleaseReader } from "@bernouy/cms-repository";
import { TEST_DIGEST, TEST_KIND, TEST_VERSION } from "./compatibility";

type RegistryReleaseEvidence = NonNullable<Awaited<ReturnType<RepositoryReleaseReader["get"]>>>;

export function registryReleaseEvidence(): RegistryReleaseEvidence {
    const reportDigest = "c".repeat(64);
    const compatibility = {
        schema: "cms.integration.compatibility-report.v2" as const,
        reportId: "compatibility-1",
        revisionType: "root" as const,
        origin: "admission" as const,
        createdAt: "2026-07-26T10:00:00.000Z",
        kind: TEST_KIND,
        version: TEST_VERSION,
        packageDigest: TEST_DIGEST,
        evaluator: { name: "compatibility", version: "1.0.0" },
        baselines: [],
        informationalBaselines: [],
        findings: [
            {
                findingId: "e".repeat(64),
                classification: "compatible" as const,
                surface: "definition" as const,
                path: "/registry/private/definition.json",
                code: "definition-stable",
                baselineDigest: "d".repeat(64),
                candidateDigest: TEST_DIGEST,
                message: "The public definition contract is stable",
            },
        ],
        outcome: "compatible" as const,
        requiredReleaseLevel: "none" as const,
        releaseLevel: "patch" as const,
        contractAdmissible: true,
        provenance: { actor: "private-actor", reason: "Candidate evaluation" },
    };
    const migration = {
        schema: "cms.integration.migration-report.v1" as const,
        reportId: "migration-1",
        revisionType: "root" as const,
        origin: "admission" as const,
        createdAt: "2026-07-26T10:00:00.000Z",
        source: { kind: TEST_KIND, version: "1.2.2", packageDigest: "d".repeat(64) },
        target: { kind: TEST_KIND, version: TEST_VERSION, packageDigest: TEST_DIGEST },
        connectorKey: "primary",
        lineageId: "commerce-supabase-v1",
        migrationRevision: 1,
        supportedSourceRange: "^1.2.0",
        runner: { name: "cms-postgres-migration", version: "1.0.0", imageDigest: "sha256:migration" },
        policy: { name: "official", version: "1.0.0" },
        policySnapshotDigest: reportDigest,
        migrationInputDigest: reportDigest,
        migrationJobResultDigest: reportDigest,
        statefulChangeSelectionDigest: reportDigest,
        environmentDigest: reportDigest,
        checks: {
            freshInstall: { outcome: "passed" as const, evidenceDigest: reportDigest },
            migratedState: { outcome: "passed" as const, evidenceDigest: reportDigest },
            equivalence: { outcome: "passed" as const, evidenceDigest: reportDigest },
            failureInjection: { outcome: "not-supported" as const },
            resumption: { outcome: "not-supported" as const },
        },
        cutover: { cmsMediated: "binding-revision" as const, providerDirect: "expand-in-code" as const },
        cutoverEvidence: {
            cmsMediated: { outcome: "passed" as const, evidenceDigest: reportDigest },
            providerDirect: { outcome: "not-supported" as const },
            activation: { outcome: "passed" as const, evidenceDigest: reportDigest },
        },
        policyEvaluation: {
            releaseLevel: "patch" as const,
            applicable: true,
            satisfied: true,
            checks: [],
            reasons: [],
        },
        operationalEvidence: {
            downtime: { status: "zero-downtime" as const, observedSeconds: 0, evidenceDigest: reportDigest },
            drain: { cmsMediatedSeconds: 30 },
            rollback: { capability: "available" as const, verified: true, evidenceDigest: reportDigest },
            pointOfNoReturn: { phase: "cleanup", observation: "crossed" as const, evidenceDigest: reportDigest },
            cleanup: { delaySeconds: 60, observed: true, evidenceDigest: reportDigest },
        },
        outcome: "passed" as const,
        provenance: { actor: "private-actor", reason: "Migration admission" },
    };
    return {
        kind: TEST_KIND,
        version: TEST_VERSION,
        packageDigest: TEST_DIGEST,
        compatibility: history(compatibility),
        migrations: [history(migration)],
    };
}

function history<T extends { reportId: string }>(current: T) {
    return {
        currentRevisionId: current.reportId,
        currentReportDigest: "c".repeat(64),
        current,
        revisions: [current],
    };
}
