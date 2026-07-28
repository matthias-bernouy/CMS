import { migrationReportFixture } from "./migrationReport";

export function candidateReportFixture() {
    return {
        report: {
            schema: "cms.repository.management.candidate-report.v1",
            candidate: {
                candidateId: "candidate-1",
                revision: 4,
                status: "rejected",
                kind: "commerce",
                version: "1.2.0",
                candidateDigest: "5".repeat(64),
                packageDigest: "c".repeat(64),
                verificationDigest: "6".repeat(64),
                createdAt: "2026-07-26T12:00:00.000Z",
                updatedAt: "2026-07-26T12:01:00.000Z",
                expiresAt: "2026-07-27T12:00:00.000Z",
                attemptCount: 2,
                lastFailure: {
                    code: "verification-failed",
                    kind: "suite",
                    occurredAt: "2026-07-26T12:01:00.000Z",
                },
            },
            compatibility: {
                kind: "commerce",
                version: "1.2.0",
                packageDigest: "c".repeat(64),
                outcome: "breaking",
                contractAdmissible: false,
                releaseLevel: "minor",
                requiredReleaseLevel: "major",
                baselines: [{ kind: "commerce", version: "1.1.0", packageDigest: "b".repeat(64) }],
                informationalBaselines: [],
                findings: [
                    {
                        findingId: "schema:orders:column-removed",
                        classification: "breaking",
                        surface: "schema",
                        path: "public.orders.legacy_reference",
                        code: "column-removed",
                        message: "Literal <img src=x onerror=alert(1)> finding",
                        baselineDigest: "b".repeat(64),
                        candidateDigest: "c".repeat(64),
                    },
                ],
            },
            verification: {
                state: "completed",
                bindings: {
                    candidateId: "candidate-1",
                    candidateDigest: "5".repeat(64),
                    packageDigest: "c".repeat(64),
                    verificationDigest: "6".repeat(64),
                    policyDigest: "7".repeat(64),
                    behavioralRlsPlanDigest: "8".repeat(64),
                },
                runner: {
                    name: "cms-postgres",
                    version: "1.0.0",
                    imageDigest: `sha256:${"9".repeat(64)}`,
                },
                environment: {
                    digest: "a".repeat(64),
                    versions: [{ name: "postgres", version: "16.4" }],
                },
                outcome: "failed",
                suites: [
                    {
                        suiteId: "behavioral-rls",
                        source: "platform",
                        contentDigest: "d".repeat(64),
                        applicable: true,
                        outcome: "failed",
                        durationMs: 42,
                        attempts: 2,
                        cacheHit: false,
                        diagnostics: [{ code: "rls-cross-tenant-visible", redacted: true }],
                    },
                ],
            },
            migrations: [migrationReportFixture()],
        },
    };
}
