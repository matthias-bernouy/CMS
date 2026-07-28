import { identifyCompatibilityReportV2 } from "@bernouy/cms-integration-verification";

export const TEST_KIND = "commerce";
export const TEST_VERSION = "1.2.3";
export const TEST_DIGEST = "a".repeat(64);
export const TEST_CREATED_AT = "2026-07-26T10:00:00.000Z";

export function admissionReport(overrides: Readonly<Record<string, unknown>> = {}): Readonly<Record<string, unknown>> {
    return {
        schema: "cms.integration.compatibility-report.v2",
        reportId: "report-admission",
        revisionType: "root",
        origin: "admission",
        kind: TEST_KIND,
        version: TEST_VERSION,
        packageDigest: TEST_DIGEST,
        evaluator: { name: "repository-compatibility", version: "2.0.0" },
        createdAt: TEST_CREATED_AT,
        baselines: [],
        informationalBaselines: [],
        findings: [],
        outcome: "not-applicable",
        requiredReleaseLevel: "none",
        releaseLevel: "initial",
        contractAdmissible: true,
        noBaselineReason: "new-kind",
        provenance: { actor: "administrator-subject", reason: "Initial evaluation" },
        ...overrides,
    };
}

export function revisionReport(overrides: Readonly<Record<string, unknown>> = {}): Readonly<Record<string, unknown>> {
    return {
        ...admissionReport(),
        reportId: "report-revision",
        revisionType: "revision",
        supersedes: "report-admission",
        provenance: { actor: "administrator-subject", reason: "Manual evidence review" },
        ...overrides,
    };
}

export async function compatibilityPage(
    overrides: Readonly<Record<string, unknown>> = {},
): Promise<Readonly<Record<string, unknown>>> {
    const root = admissionReport();
    const page = { root, current: root, revisions: [], totalRevisions: 0, ...overrides };
    const current = await identifyCompatibilityReportV2(page.current);
    return {
        ...page,
        currentRevisionId: current.report.reportId,
        currentReportDigest: current.digest,
        ...overrides,
    };
}

export async function reportReference(
    report: unknown,
): Promise<Readonly<{ revisionId: string; reportDigest: string }>> {
    const identified = await identifyCompatibilityReportV2(report);
    return { revisionId: identified.report.reportId, reportDigest: identified.digest };
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
