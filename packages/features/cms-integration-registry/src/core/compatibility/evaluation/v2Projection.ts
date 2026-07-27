import type {
    CompatibilityReportV2,
    ReportHistoryFields,
    ReportProvenance,
} from "@bernouy/cms-integration-verification";
import type { IntegrationCompatibilityReport } from "../../../interfaces/compatibility";
import { buildCompatibilityReportV2 } from "./reportBuilder";

export async function projectCompatibilityReportV2(input: {
    report: IntegrationCompatibilityReport;
    history: ReportHistoryFields;
    provenance: ReportProvenance;
}): Promise<Readonly<{ report: CompatibilityReportV2; digest: string }>> {
    return await buildCompatibilityReportV2({
        evaluation: {
            kind: input.report.kind,
            version: input.report.version,
            packageDigest: input.report.packageDigest,
            baselines: input.report.baselines,
            informationalBaselines: input.report.informationalBaselines,
            evidence: input.report.evidence,
            outcome: input.report.outcome,
            requiredReleaseLevel: input.report.requiredReleaseLevel,
            releaseLevel: input.report.releaseLevel,
            contractAdmissible: input.report.admissible,
            ...(input.report.noBaselineReason ? { noBaselineReason: input.report.noBaselineReason } : {}),
        },
        evaluator: input.report.evaluator,
        history: input.history,
        provenance: input.provenance,
    });
}
