export const TEST_KIND = "commerce";
export const TEST_VERSION = "1.2.3";
export const TEST_DIGEST = "a".repeat(64);
export const TEST_CREATED_AT = "2026-07-26T10:00:00.000Z";

export function admissionReport(overrides: Readonly<Record<string, unknown>> = {}): Readonly<Record<string, unknown>> {
    return {
        reportType: "admission",
        id: "report-admission",
        kind: TEST_KIND,
        version: TEST_VERSION,
        packageDigest: TEST_DIGEST,
        evaluator: { name: "repository-compatibility", version: "1.0.0" },
        createdAt: TEST_CREATED_AT,
        baselines: [],
        informationalBaselines: [],
        evidence: [],
        outcome: "compatible",
        requiredReleaseLevel: "none",
        releaseLevel: "initial",
        admissible: true,
        noBaselineReason: "new-kind",
        ...overrides,
    };
}

export function revisionReport(overrides: Readonly<Record<string, unknown>> = {}): Readonly<Record<string, unknown>> {
    return {
        ...admissionReport(),
        reportType: "revision",
        id: "report-revision",
        supersedes: "report-admission",
        provenance: { actor: "administrator-subject", reason: "Manual evidence review" },
        ...overrides,
    };
}

export function compatibilityPage(
    overrides: Readonly<Record<string, unknown>> = {},
): Readonly<Record<string, unknown>> {
    const admission = admissionReport();
    return {
        admission,
        current: admission,
        revisions: [],
        totalRevisions: 0,
        ...overrides,
    };
}

export function promotionRecord(overrides: Readonly<Record<string, unknown>> = {}): Readonly<Record<string, unknown>> {
    return {
        schema: "cms.integration.registry.stable-promotion.v2",
        id: "promotion-record",
        operationId: "promotion-operation",
        kind: TEST_KIND,
        version: TEST_VERSION,
        packageDigest: TEST_DIGEST,
        reportRevisionId: "report-admission",
        reportDigest: "b".repeat(64),
        reportType: "release-admission-decision",
        actor: "administrator-subject",
        confirmation: { version: TEST_VERSION, reportRevisionId: "report-admission" },
        createdAt: TEST_CREATED_AT,
        ...overrides,
    };
}
