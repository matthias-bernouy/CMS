import type { CompatibilityReportV2 } from "../../interfaces/reports/compatibility";
import { COMPATIBILITY_REPORT_V2_SCHEMA } from "../../interfaces/reports/compatibility";
import { parseCompatibilityFinding } from "../finding";
import { parseVerificationPolicyIdentity } from "../runner";
import { IntegrationVerificationContractError } from "../validation/errors";
import { assertContractIJson, assertUnique, boundedArray, strictRecord } from "../validation/structure";
import { exactVersion, oneOf, packageKind, requiredBoolean, sha256Digest } from "../validation/values";
import { parseReportHistoryFields, parseReportProvenance, parseVersionDigestReferences } from "./shared";

const FIELDS = [
    "schema",
    "reportId",
    "revisionType",
    "origin",
    "createdAt",
    "supersedes",
    "kind",
    "version",
    "packageDigest",
    "evaluator",
    "baselines",
    "informationalBaselines",
    "findings",
    "outcome",
    "requiredReleaseLevel",
    "releaseLevel",
    "contractAdmissible",
    "noBaselineReason",
    "provenance",
] as const;

export async function parseCompatibilityReportV2(value: unknown): Promise<CompatibilityReportV2> {
    assertContractIJson(value);
    const input = strictRecord(value, "compatibilityReport", FIELDS);
    if (input.schema !== COMPATIBILITY_REPORT_V2_SCHEMA) {
        throw new IntegrationVerificationContractError(
            "invalid_schema",
            `compatibilityReport.schema must be ${COMPATIBILITY_REPORT_V2_SCHEMA}`,
            "compatibilityReport.schema",
        );
    }
    const packageDigest = sha256Digest(input.packageDigest, "compatibilityReport.packageDigest");
    const baselines = parseVersionDigestReferences(input.baselines, "compatibilityReport.baselines");
    const informationalBaselines = parseVersionDigestReferences(
        input.informationalBaselines,
        "compatibilityReport.informationalBaselines",
    );
    const findingPromises = boundedArray(input.findings, "compatibilityReport.findings", parseCompatibilityFinding);
    const findings = await Promise.all(findingPromises);
    assertUnique(
        findings.map((finding) => finding.findingId),
        "compatibilityReport.findings.findingId",
    );
    assertFindingReferences(
        findings,
        packageDigest,
        [...baselines, ...informationalBaselines].map((entry) => entry.packageDigest),
    );
    const report: CompatibilityReportV2 = {
        schema: COMPATIBILITY_REPORT_V2_SCHEMA,
        ...parseReportHistoryFields(input, "compatibilityReport"),
        kind: packageKind(input.kind, "compatibilityReport.kind"),
        version: exactVersion(input.version, "compatibilityReport.version"),
        packageDigest,
        evaluator: parseVerificationPolicyIdentity(input.evaluator, "compatibilityReport.evaluator"),
        baselines,
        informationalBaselines,
        findings,
        outcome: oneOf(input.outcome, "compatibilityReport.outcome", [
            "compatible",
            "breaking",
            "unknown",
            "invalid",
            "not-applicable",
        ] as const),
        requiredReleaseLevel: oneOf(input.requiredReleaseLevel, "compatibilityReport.requiredReleaseLevel", [
            "none",
            "patch",
            "minor",
            "major",
        ] as const),
        releaseLevel: oneOf(input.releaseLevel, "compatibilityReport.releaseLevel", [
            "initial",
            "patch",
            "minor",
            "major",
        ] as const),
        contractAdmissible: requiredBoolean(input.contractAdmissible, "compatibilityReport.contractAdmissible"),
        ...(input.noBaselineReason === undefined
            ? {}
            : {
                  noBaselineReason: oneOf(input.noBaselineReason, "compatibilityReport.noBaselineReason", [
                      "new-kind",
                      "new-major",
                  ] as const),
              }),
        provenance: parseReportProvenance(input.provenance, "compatibilityReport.provenance"),
    };
    assertBaselineSemantics(report);
    return report;
}

function assertFindingReferences(
    findings: readonly Awaited<ReturnType<typeof parseCompatibilityFinding>>[],
    packageDigest: string,
    baselineDigests: readonly string[],
): void {
    for (const finding of findings) {
        if (finding.candidateDigest !== packageDigest || !baselineDigests.includes(finding.baselineDigest)) {
            throw new IntegrationVerificationContractError(
                "invalid_reference",
                "compatibility finding must reference this candidate and one of this report's baselines",
                "compatibilityReport.findings",
            );
        }
    }
}

function assertBaselineSemantics(report: CompatibilityReportV2): void {
    if (report.releaseLevel === "initial") {
        if (
            report.outcome !== "not-applicable" ||
            report.noBaselineReason !== "new-kind" ||
            report.baselines.length !== 0
        ) {
            throw invalidSemantics("initial reports require new-kind, not-applicable, and no comparison baseline");
        }
        return;
    }
    if (report.noBaselineReason === "new-kind") {
        throw invalidSemantics("new-kind is valid only for an initial release");
    }
    if (report.noBaselineReason === "new-major" && report.releaseLevel !== "major") {
        throw invalidSemantics("new-major is valid only for a major release");
    }
    if (!report.noBaselineReason && report.baselines.length === 0) {
        throw invalidSemantics("a non-initial report requires a comparison baseline or noBaselineReason");
    }
}

function invalidSemantics(message: string): IntegrationVerificationContractError {
    return new IntegrationVerificationContractError("invalid_contract", message, "compatibilityReport");
}
