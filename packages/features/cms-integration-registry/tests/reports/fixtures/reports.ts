import {
    createCompatibilityFinding,
    deriveCompatibilityReportAssessment,
    type CompatibilityReportV2,
    type MigrationReport,
    type VerificationReport,
} from "@bernouy/cms-integration-verification";

export const CREATED_AT = "2026-07-26T12:00:00.000Z";
export const POLICY_DIGEST = "c".repeat(64);
const EVIDENCE_DIGEST = "d".repeat(64);
const RUNNER_IMAGE = `sha256:${"e".repeat(64)}`;

export async function compatibilityReport(
    sourceDigest: string,
    targetDigest: string,
    overrides: Partial<CompatibilityReportV2> = {},
): Promise<CompatibilityReportV2> {
    const finding = await createCompatibilityFinding({
        surface: "schema",
        path: "public.items.label",
        code: "column-added",
        baselineDigest: sourceDigest,
        candidateDigest: targetDigest,
        classification: "additive",
        message: "Column label was added",
    });
    const assessment = deriveCompatibilityReportAssessment({ effectiveFindings: [finding], releaseLevel: "minor" });
    return {
        schema: "cms.integration.compatibility-report.v2",
        reportId: "compatibility-1",
        revisionType: "root",
        origin: "admission",
        createdAt: CREATED_AT,
        kind: "demo",
        version: "1.1.0",
        packageDigest: targetDigest,
        evaluator: { name: "static-compatibility", version: "2.0.0" },
        baselines: [{ kind: "demo", version: "1.0.0", packageDigest: sourceDigest }],
        informationalBaselines: [],
        findings: [finding],
        ...assessment,
        releaseLevel: "minor",
        provenance: releaseProvenance(),
        ...overrides,
    };
}

export function verificationReport(
    targetDigest: string,
    overrides: Partial<VerificationReport> = {},
): VerificationReport {
    return {
        schema: "cms.integration.verification-report.v1",
        reportId: "verification-1",
        revisionType: "root",
        origin: "legacy-backfill",
        createdAt: CREATED_AT,
        kind: "demo",
        version: "1.1.0",
        packageDigest: targetDigest,
        verificationDigest: "a".repeat(64),
        runner: { name: "cms-postgres", version: "1.0.0", imageDigest: RUNNER_IMAGE },
        policy: releasePolicy(),
        policySnapshotDigest: POLICY_DIGEST,
        admissionInputDigest: "b".repeat(64),
        verificationJobResultDigest: EVIDENCE_DIGEST,
        dependencies: [],
        baselines: [],
        activeContracts: [],
        environment: { digest: "b".repeat(64), versions: { postgres: "16.4", bun: "1.3.14" } },
        results: [
            {
                suiteId: "platform-install-rerun",
                source: "platform",
                required: true,
                outcome: "passed",
                durationMs: 20,
                attempts: 1,
                cacheHit: false,
                evidenceDigests: [EVIDENCE_DIGEST],
                diagnostics: [],
            },
        ],
        outcome: "passed",
        provenance: releaseProvenance(),
        ...overrides,
    };
}

export async function migrationReport(
    sourceDigest: string,
    targetDigest: string,
    selectionDigest: string,
    overrides: Partial<MigrationReport> = {},
): Promise<MigrationReport> {
    const passed = { outcome: "passed" as const, evidenceDigest: EVIDENCE_DIGEST };
    return {
        schema: "cms.integration.migration-report.v1",
        reportId: "migration-1",
        revisionType: "root",
        origin: "admission",
        createdAt: CREATED_AT,
        source: { kind: "demo", version: "1.0.0", packageDigest: sourceDigest },
        target: { kind: "demo", version: "1.1.0", packageDigest: targetDigest },
        connectorKey: "primary",
        lineageId: "demo-supabase-v1",
        migrationRevision: 1,
        supportedSourceRange: "^1.0.0",
        runner: { name: "cms-postgres", version: "1.0.0", imageDigest: RUNNER_IMAGE },
        policy: releasePolicy(),
        policySnapshotDigest: POLICY_DIGEST,
        migrationInputDigest: "a".repeat(64),
        migrationJobResultDigest: EVIDENCE_DIGEST,
        statefulChangeSelectionDigest: selectionDigest,
        environmentDigest: "b".repeat(64),
        checks: {
            freshInstall: passed,
            migratedState: passed,
            equivalence: passed,
            failureInjection: { outcome: "not-supported" },
            resumption: { outcome: "not-supported" },
        },
        cutover: { cmsMediated: "binding-revision", providerDirect: "expand-in-code" },
        rollback: "available",
        pointOfNoReturn: "cleanup",
        delayedCleanupVerified: true,
        outcome: "passed",
        provenance: releaseProvenance(),
        ...overrides,
    };
}

export function releasePolicy() {
    return { name: "default-admission", version: "1.2.0" } as const;
}

export function releaseProvenance() {
    return { actor: "repository-ci", reason: "release-admission" } as const;
}
