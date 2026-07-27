import type { CompatibilityReportV2 } from "@bernouy/cms-integration-verification";

export function projectCandidateCompatibility(report: CompatibilityReportV2) {
    return {
        kind: report.kind,
        version: report.version,
        packageDigest: report.packageDigest,
        outcome: report.outcome,
        contractAdmissible: report.contractAdmissible,
        releaseLevel: report.releaseLevel,
        requiredReleaseLevel: report.requiredReleaseLevel,
        baselines: report.baselines.map(projectBaseline),
        informationalBaselines: report.informationalBaselines.map(projectBaseline),
        findings: report.findings.map((finding) => ({
            findingId: finding.findingId,
            classification: finding.classification,
            surface: finding.surface,
            path: finding.path,
            code: finding.code,
            message: finding.message,
            baselineDigest: finding.baselineDigest,
            candidateDigest: finding.candidateDigest,
        })),
    };
}

function projectBaseline(baseline: CompatibilityReportV2["baselines"][number]) {
    return { kind: baseline.kind, version: baseline.version, packageDigest: baseline.packageDigest };
}
