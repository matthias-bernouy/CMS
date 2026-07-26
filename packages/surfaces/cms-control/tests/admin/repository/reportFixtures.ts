const operationCounter = {
    attempted: 2,
    inFlight: 0,
    succeeded: 1,
    rejected: 1,
    failed: 0,
    totalDurationMs: 12,
    maximumDurationMs: 8,
};

const metricsFixture = {
    operations: {
        publication: operationCounter,
        stablePromotion: operationCounter,
        compatibilityReevaluation: operationCounter,
    },
    compatibility: { reevaluations: 1, warnings: 1 },
    publicPackages: {
        packagesServed: 4,
        packageBytes: 4_096,
        releaseNotesServed: 1,
        releaseNotesBytes: 128,
        rateLimitRejections: 2,
        downloadRateLimitRejections: 1,
    },
    repositoryReads: {
        total: 8,
        succeeded: 6,
        notFound: 1,
        rejected: 1,
        failed: 0,
        totalDurationMs: 45,
        maximumDurationMs: 12,
    },
    snapshot: { integrations: 14, versions: 18, diagnostics: 1, quarantined: 1, recoveryDiagnostics: 1 },
    filesystem: {
        status: "available",
        checkedAt: "2026-07-26T12:00:00.000Z",
        totalBytes: "10000",
        freeBytes: "4000",
        availableBytes: "3500",
        usedBytes: "6000",
        usedBasisPoints: 6000,
    },
};

export const statusFixture = {
    ready: true,
    health: "healthy",
    integrations: 14,
    versions: 18,
    diagnostics: 1,
    quarantined: 1,
    recoveryDiagnostics: 1,
    metrics: metricsFixture,
};

export const diagnosticsFixture = {
    health: "degraded",
    diagnostics: [
        {
            code: "invalid-package",
            stage: "package",
            message: "A <script>alert(1)</script> package failed",
            kind: "broken",
        },
    ],
    quarantined: [{ kind: "broken", diagnosticCodes: ["invalid-package"] }],
    recovery: [{ code: "publication-recovered", message: "Recovered safely", operationId: "operation-1" }],
    metrics: metricsFixture,
    recentOperations: [
        {
            timestamp: "2026-07-26T12:00:00.000Z",
            operation: "publication",
            operationId: "publication-operation",
            outcome: "succeeded",
            durationMs: 8,
            kind: "commerce",
            version: "1.1.0",
            digest: "b".repeat(64),
            reportId: "admission-1",
            evaluatorName: "contract-evaluator",
            evaluatorVersion: "2.0.0",
            compatibilityOutcome: "compatible",
        },
    ],
};

export const versionsFixture = {
    kind: "commerce",
    stable: "1.0.0",
    latest: "1.1.0",
    versions: [
        { version: "1.0.0", digest: "a".repeat(64), status: "unverified", compatibility: null },
        {
            version: "1.1.0",
            digest: "b".repeat(64),
            blockPreview: {
                current: { stable: "1.0.0", latest: "1.1.0" },
                next: { stable: "1.0.0", latest: "1.0.0" },
            },
            release: {
                verificationDigest: "c".repeat(64),
                verificationOrigin: "legacy-backfill",
                verificationOutcome: "passed",
                decisionRevisionId: "decision-1",
                decisionDigest: "d".repeat(64),
                admissible: true,
            },
            compatibility: {
                admissionReportId: "admission-1",
                currentReportRevisionId: "revision-1",
                outcome: "compatible",
                admissible: true,
                warning: false,
            },
        },
    ],
};

export function releaseFixture() {
    return {
        kind: "commerce",
        version: "1.1.0",
        packageDigest: "b".repeat(64),
        verificationDigest: "c".repeat(64),
        status: "installable",
        installable: true,
        freshInstallOnly: false,
        compatibility: {
            reportId: "compatibility-v2-1",
            reportDigest: "e".repeat(64),
            origin: "admission",
            outcome: "compatible",
            contractAdmissible: true,
            releaseLevel: "minor",
            requiredReleaseLevel: "minor",
            findings: [
                {
                    findingId: "finding-1",
                    classification: "additive",
                    surface: "schema",
                    path: "relations.orders.columns.reference",
                    code: "column-added",
                    message: "A nullable reference column was added",
                },
            ],
        },
        verification: {
            reportId: "verification-1",
            reportDigest: "f".repeat(64),
            origin: "legacy-backfill",
            outcome: "passed",
            runner: { name: "cms-postgres", version: "1.0.0", imageDigest: `sha256:${"1".repeat(64)}` },
            environment: { digest: "2".repeat(64), versions: { postgres: "16.4" } },
            policy: { name: "verification", version: "1.0.0", snapshotDigest: "3".repeat(64) },
            results: [
                {
                    suiteId: "sql-install-and-reapply",
                    source: "platform",
                    required: true,
                    outcome: "passed",
                    attempts: 1,
                    cacheHit: false,
                    diagnostics: [],
                },
            ],
        },
        migrations: [
            {
                reportId: "migration-1",
                reportDigest: "5".repeat(64),
                origin: "admission",
                source: { kind: "commerce", version: "1.0.0", packageDigest: "a".repeat(64) },
                supportedSourceRange: "^1.0.0",
                connectorKey: "primary",
                lineageId: "commerce-supabase-v1",
                migrationRevision: 2,
                outcome: "passed",
                runner: {
                    name: "cms-postgres-migration",
                    version: "1.0.0",
                    imageDigest: `sha256:${"6".repeat(64)}`,
                },
                environmentDigest: "7".repeat(64),
                checks: {
                    freshInstall: { outcome: "passed", evidenceDigest: "8".repeat(64) },
                    equivalence: { outcome: "passed", evidenceDigest: "9".repeat(64) },
                },
                cutover: { cmsMediated: "binding-revision", providerDirect: "expand-in-code" },
                rollback: "available",
                pointOfNoReturn: "cleanup",
                delayedCleanupVerified: true,
            },
        ],
        decision: {
            decisionId: "decision-1",
            decisionDigest: "d".repeat(64),
            admissible: true,
            reasons: [],
            createdAt: "2026-07-26T12:00:00.000Z",
            policy: { name: "admission", version: "1.0.0", snapshotDigest: "4".repeat(64) },
        },
    };
}

export function compatibilityFixture() {
    const admission = admissionReport();
    const current = revisionReport();
    return { admission, current, revisions: [current], totalRevisions: 1 };
}

export function admissionReport(overrides: Record<string, unknown> = {}) {
    return reportBase({ id: "admission-1", reportType: "admission", ...overrides });
}

export function revisionReport(overrides: Record<string, unknown> = {}) {
    return reportBase({
        id: "revision-1",
        reportType: "revision",
        supersedes: "admission-1",
        provenance: {
            actor: "repository-owner@example.test",
            reason: "Reviewed <script>unsafe()</script> evidence",
            evidenceIds: ["ci-schema-42"],
        },
        ...overrides,
    });
}

function reportBase(overrides: Record<string, unknown>) {
    return {
        kind: "commerce",
        version: "1.1.0",
        packageDigest: "b".repeat(64),
        evaluator: { name: "contract-evaluator", version: "2.0.0" },
        createdAt: "2026-07-26T12:00:00.000Z",
        baselines: [{ kind: "commerce", version: "1.0.0", packageDigest: "a".repeat(64) }],
        informationalBaselines: [],
        evidence: [
            {
                classification: "compatible",
                surface: "schema",
                code: "column-added",
                path: "/private/schema.sql",
                source: "http://repository.internal:3001",
                message: "Literal <img src=x onerror=alert(1)> evidence",
            },
        ],
        outcome: "compatible",
        requiredReleaseLevel: "minor",
        releaseLevel: "minor",
        admissible: true,
        ...overrides,
    };
}
