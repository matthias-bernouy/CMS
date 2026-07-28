import {
    createCompatibilityFinding,
    deriveCompatibilityReportAssessment,
    identifyCompatibilityReportV2,
    type CompatibilityReportV2,
    type ReportHistoryFields,
    type ReportProvenance,
} from "@bernouy/cms-integration-verification";
import type {
    IntegrationCompatibilityEvaluation,
    IntegrationCompatibilityEvaluatorIdentity,
    IntegrationCompatibilityEvidence,
} from "../../../interfaces/compatibility";

export async function buildCompatibilityReportV2(input: {
    evaluation: IntegrationCompatibilityEvaluation;
    evaluator: IntegrationCompatibilityEvaluatorIdentity;
    history: ReportHistoryFields;
    provenance: ReportProvenance;
}): Promise<Readonly<{ report: CompatibilityReportV2; digest: string }>> {
    const findings = await compatibilityFindings(input.evaluation);
    const assessment = deriveCompatibilityReportAssessment({
        effectiveFindings: findings,
        releaseLevel: input.evaluation.releaseLevel,
        ...(input.evaluation.noBaselineReason ? { noBaselineReason: input.evaluation.noBaselineReason } : {}),
    });
    if (assessment.contractAdmissible !== input.evaluation.contractAdmissible) {
        throw new TypeError("Compatibility evaluation and V2 assessment disagree");
    }
    const identified = await identifyCompatibilityReportV2({
        schema: "cms.integration.compatibility-report.v2",
        ...input.history,
        kind: input.evaluation.kind,
        version: input.evaluation.version,
        packageDigest: input.evaluation.packageDigest,
        evaluator: input.evaluator,
        baselines: input.evaluation.baselines,
        informationalBaselines: input.evaluation.informationalBaselines,
        findings,
        ...assessment,
        releaseLevel: input.evaluation.releaseLevel,
        ...(input.evaluation.noBaselineReason ? { noBaselineReason: input.evaluation.noBaselineReason } : {}),
        provenance: input.provenance,
    });
    return Object.freeze({ report: identified.report, digest: identified.digest });
}

async function compatibilityFindings(evaluation: IntegrationCompatibilityEvaluation) {
    const baselineDigest =
        evaluation.baselines[0]?.packageDigest ??
        evaluation.informationalBaselines[0]?.packageDigest ??
        evaluation.packageDigest;
    const grouped = new Map<string, IntegrationCompatibilityEvidence>();
    for (const entry of evaluation.evidence) {
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
                candidateDigest: evaluation.packageDigest,
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
