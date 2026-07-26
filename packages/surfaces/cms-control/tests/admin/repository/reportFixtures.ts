export const statusFixture = {
    ready: true,
    health: "healthy",
    integrations: 14,
    versions: 18,
    diagnostics: 1,
    quarantined: 1,
    recoveryDiagnostics: 1,
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
};

export const versionsFixture = {
    kind: "commerce",
    stable: "1.0.0",
    latest: "1.1.0",
    versions: [
        { version: "1.0.0", digest: "a".repeat(64), compatibility: null },
        {
            version: "1.1.0",
            digest: "b".repeat(64),
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
