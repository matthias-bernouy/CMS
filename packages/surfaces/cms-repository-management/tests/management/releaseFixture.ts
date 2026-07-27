import type { IntegrationRegistryReleaseEvidence } from "@bernouy/cms-integration-registry";

const PACKAGE_DIGEST = "a".repeat(64);
const REPORT_DIGEST = "c".repeat(64);
const VERIFICATION_DIGEST = "b".repeat(64);

export function richReleaseEvidence(): IntegrationRegistryReleaseEvidence {
    const verification = {
        schema: "cms.integration.verification-report.v1" as const,
        reportId: "verification-1",
        revisionType: "root" as const,
        origin: "legacy-backfill" as const,
        createdAt: "2026-07-26T10:00:00.000Z",
        kind: "commerce",
        version: "1.0.0",
        packageDigest: PACKAGE_DIGEST,
        verificationDigest: VERIFICATION_DIGEST,
        runner: { name: "cms-postgres", version: "1.0.0", imageDigest: `sha256:${"d".repeat(64)}` },
        policy: { name: "official", version: "1.0.0" },
        policySnapshotDigest: REPORT_DIGEST,
        admissionInputDigest: REPORT_DIGEST,
        verificationJobResultDigest: REPORT_DIGEST,
        dependencies: [],
        baselines: [],
        activeContracts: [{ contractId: "public-api", ownerVersion: "1.0.0", digest: REPORT_DIGEST }],
        environment: { digest: REPORT_DIGEST, versions: { postgres: "16.9" } },
        results: [
            {
                suiteId: "platform-postgres-install-reapply",
                source: "platform" as const,
                required: true,
                outcome: "passed" as const,
                durationMs: 17,
                attempts: 1,
                cacheHit: false,
                evidenceDigests: [REPORT_DIGEST],
                diagnostics: [],
            },
        ],
        outcome: "passed" as const,
        provenance: { actor: "repository-bootstrap", reason: "Legacy backfill" },
    };
    const migration = {
        schema: "cms.integration.migration-report.v3" as const,
        reportId: "migration-1",
        revisionType: "root" as const,
        origin: "admission" as const,
        createdAt: "2026-07-26T10:00:00.000Z",
        source: { kind: "commerce", version: "0.9.0", packageDigest: "e".repeat(64) },
        target: { kind: "commerce", version: "1.0.0", packageDigest: PACKAGE_DIGEST },
        connectorKey: "primary",
        lineageId: "commerce-supabase-v1",
        migrationRevision: 1,
        supportedSourceRange: "^0.9.0",
        runner: { name: "cms-postgres", version: "1.0.0", imageDigest: `sha256:${"d".repeat(64)}` },
        policy: { name: "official", version: "1.0.0" },
        policySnapshotDigest: REPORT_DIGEST,
        migrationInputDigest: REPORT_DIGEST,
        migrationJobResultDigest: REPORT_DIGEST,
        statefulChangeSelectionDigest: REPORT_DIGEST,
        environmentDigest: REPORT_DIGEST,
        checks: {
            freshInstall: { outcome: "passed" as const, evidenceDigest: REPORT_DIGEST },
            migratedState: { outcome: "passed" as const, evidenceDigest: REPORT_DIGEST },
            equivalence: { outcome: "passed" as const, evidenceDigest: REPORT_DIGEST },
            failureInjection: { outcome: "not-supported" as const },
            resumption: { outcome: "not-supported" as const },
        },
        cutover: { cmsMediated: "binding-revision" as const, providerDirect: "expand-in-code" as const },
        rollback: "available" as const,
        pointOfNoReturn: "cleanup",
        delayedCleanupVerified: true,
        outcome: "passed" as const,
        policyEvaluation: {
            releaseLevel: "minor" as const,
            applicable: true,
            satisfied: true,
            checks: [],
            reasons: [],
        },
        operationalEvidence: {
            downtime: { status: "zero-downtime" as const, observedSeconds: 0, evidenceDigest: REPORT_DIGEST },
            drain: { cmsMediatedSeconds: 30, providerDirectSeconds: 60 },
            rollback: { capability: "available" as const, verified: true, evidenceDigest: REPORT_DIGEST },
            pointOfNoReturn: {
                phase: "cleanup",
                observation: "crossed" as const,
                evidenceDigest: REPORT_DIGEST,
            },
            cleanup: { delaySeconds: 60, observed: true, evidenceDigest: REPORT_DIGEST },
        },
        provenance: { actor: "repository-worker", reason: "Migration admission" },
    };
    return {
        kind: "commerce",
        version: "1.0.0",
        packageDigest: PACKAGE_DIGEST,
        verificationDigest: VERIFICATION_DIGEST,
        verification: history(verification),
        migrations: [history(migration)],
    };
}

function history<T extends { reportId: string }>(current: T) {
    return {
        currentRevisionId: current.reportId,
        currentReportDigest: REPORT_DIGEST,
        current,
        revisions: [current],
    };
}
