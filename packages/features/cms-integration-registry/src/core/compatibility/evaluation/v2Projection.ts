import {
    createCompatibilityFinding,
    deriveCompatibilityReportAssessment,
    identifyCompatibilityReportV2,
    type CompatibilityReportV2,
    type ReportHistoryFields,
    type ReportProvenance,
} from "@bernouy/cms-integration-verification";
import type {
    IntegrationCompatibilityEvidence,
    IntegrationCompatibilityReport,
} from "../../../interfaces/compatibility";

export async function projectCompatibilityReportV2(input: {
    report: IntegrationCompatibilityReport;
    history: ReportHistoryFields;
    provenance: ReportProvenance;
}): Promise<Readonly<{ report: CompatibilityReportV2; digest: string }>> {
    const findings = await compatibilityFindings(input.report);
    const assessment = deriveCompatibilityReportAssessment({
        effectiveFindings: findings,
        releaseLevel: input.report.releaseLevel,
        ...(input.report.noBaselineReason ? { noBaselineReason: input.report.noBaselineReason } : {}),
    });
    const identified = await identifyCompatibilityReportV2({
        schema: "cms.integration.compatibility-report.v2",
        ...input.history,
        kind: input.report.kind,
        version: input.report.version,
        packageDigest: input.report.packageDigest,
        evaluator: input.report.evaluator,
        baselines: input.report.baselines,
        informationalBaselines: input.report.informationalBaselines,
        findings,
        ...assessment,
        releaseLevel: input.report.releaseLevel,
        ...(input.report.noBaselineReason ? { noBaselineReason: input.report.noBaselineReason } : {}),
        provenance: input.provenance,
    });
    return Object.freeze({ report: identified.report, digest: identified.digest });
}

async function compatibilityFindings(report: IntegrationCompatibilityReport) {
    const baselineDigest =
        report.baselines[0]?.packageDigest ?? report.informationalBaselines[0]?.packageDigest ?? report.packageDigest;
    const grouped = new Map<string, IntegrationCompatibilityEvidence>();
    for (const entry of report.evidence) {
        const key = `${entry.surface}\0${entry.path}\0${entry.code}`;
        const previous = grouped.get(key);
        if (!previous || compareEvidenceSeverity(entry, previous) > 0) {
            grouped.set(key, entry);
        }
    }
    return await Promise.all(
        [...grouped.values()].map((entry) =>
            createCompatibilityFinding({
                surface: entry.surface,
                path: entry.path,
                code: entry.code,
                baselineDigest,
                candidateDigest: report.packageDigest,
                classification: entry.classification,
                message: entry.message,
            }),
        ),
    );
}

function compareEvidenceSeverity(left: IntegrationCompatibilityEvidence, right: IntegrationCompatibilityEvidence) {
    const rank = { compatible: 0, additive: 1, breaking: 2, unknown: 3, invalid: 4 } as const;
    return rank[left.classification] - rank[right.classification] || (left.message < right.message ? 1 : -1);
}
