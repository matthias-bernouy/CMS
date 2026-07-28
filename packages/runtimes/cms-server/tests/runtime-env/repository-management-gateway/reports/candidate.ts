import { candidateMigration } from "./migration";
import { TEST_CREATED_AT, TEST_DIGEST, TEST_KIND, TEST_VERSION } from "./compatibility";

export const TEST_CANDIDATE_DIGEST = "b".repeat(64);
export const TEST_VERIFICATION_DIGEST = "c".repeat(64);

export function candidateReport(overrides: Readonly<Record<string, unknown>> = {}) {
    return {
        report: {
            schema: "cms.repository.management.candidate-report.v1",
            candidate: candidateProjection(),
            compatibility: candidateCompatibility(),
            verification: candidateVerification(),
            migrations: [candidateMigration()],
            ...overrides,
        },
    };
}

export function candidateProjection(overrides: Readonly<Record<string, unknown>> = {}) {
    return {
        candidateId: "candidate-1",
        revision: 4,
        status: "rejected",
        kind: TEST_KIND,
        version: TEST_VERSION,
        candidateDigest: TEST_CANDIDATE_DIGEST,
        packageDigest: TEST_DIGEST,
        verificationDigest: TEST_VERIFICATION_DIGEST,
        createdAt: TEST_CREATED_AT,
        updatedAt: "2026-07-26T10:02:00.000Z",
        expiresAt: "2026-07-27T10:00:00.000Z",
        attemptCount: 1,
        requestedChannel: "latest",
        lastFailure: {
            code: "verification-failed",
            kind: "suite",
            occurredAt: "2026-07-26T10:02:00.000Z",
        },
        ...overrides,
    };
}

function candidateCompatibility() {
    return {
        kind: TEST_KIND,
        version: TEST_VERSION,
        packageDigest: TEST_DIGEST,
        outcome: "breaking",
        contractAdmissible: false,
        releaseLevel: "minor",
        requiredReleaseLevel: "major",
        baselines: [{ kind: TEST_KIND, version: "1.1.0", packageDigest: "d".repeat(64) }],
        informationalBaselines: [],
        findings: [
            {
                findingId: "schema:orders:column-removed",
                classification: "breaking",
                surface: "schema",
                path: "public.orders.legacy_reference",
                code: "column-removed",
                message: "A declared column was removed.",
                baselineDigest: "d".repeat(64),
                candidateDigest: TEST_DIGEST,
            },
        ],
    };
}

function candidateVerification() {
    return {
        state: "completed",
        bindings: {
            candidateId: "candidate-1",
            candidateDigest: TEST_CANDIDATE_DIGEST,
            packageDigest: TEST_DIGEST,
            verificationDigest: TEST_VERIFICATION_DIGEST,
            policyDigest: "e".repeat(64),
            behavioralRlsPlanDigest: "9".repeat(64),
        },
        runner: { name: "cms-postgres", version: "1.0.0", imageDigest: `sha256:${"f".repeat(64)}` },
        environment: {
            digest: "0".repeat(64),
            versions: [{ name: "postgres", version: "16.3" }],
        },
        outcome: "failed",
        suites: [
            {
                suiteId: "platform-clean-install",
                source: "platform",
                contentDigest: "1".repeat(64),
                applicable: true,
                outcome: "failed",
                durationMs: 421,
                attempts: 2,
                cacheHit: false,
                diagnostics: [{ code: "contract-failed", redacted: true }],
            },
        ],
    };
}
