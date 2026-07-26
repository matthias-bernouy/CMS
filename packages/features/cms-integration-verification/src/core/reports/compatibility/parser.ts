import type { CompatibilityNoBaselineReason, CompatibilityReportV2 } from "../../../interfaces/reports/compatibility";
import { COMPATIBILITY_REPORT_V2_SCHEMA } from "../../../interfaces/reports/compatibility";
import { parseCompatibilityFinding } from "../../finding";
import { parseVerificationPolicyIdentity } from "../../runner";
import { IntegrationVerificationContractError } from "../../validation/errors";
import { assertContractIJson, assertUnique, boundedArray, strictRecord } from "../../validation/structure";
import { exactVersion, oneOf, packageKind, sha256Digest } from "../../validation/values";
import { identifyCanonicalVerificationContract } from "../../verification/shared";
import { deriveCompatibilityReportAssessment } from "../compatibilityAssessment";
import { parseReportHistoryFields, parseReportProvenance, parseVersionDigestReferences } from "../shared";
import { assertBaselineSemantics, assertClaimedAssessment, assertFindingReferences } from "./assertions";

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
    const findings = await Promise.all(
        boundedArray(input.findings, "compatibilityReport.findings", parseCompatibilityFinding),
    );
    assertUnique(
        findings.map((finding) => finding.findingId),
        "compatibilityReport.findings.findingId",
    );
    const releaseLevel = oneOf(input.releaseLevel, "compatibilityReport.releaseLevel", [
        "initial",
        "patch",
        "minor",
        "major",
    ] as const);
    const noBaselineReason =
        input.noBaselineReason === undefined
            ? undefined
            : oneOf(input.noBaselineReason, "compatibilityReport.noBaselineReason", ["new-kind", "new-major"] as const);
    assertBaselineSemantics({
        releaseLevel,
        noBaselineReason,
        baselineCount: baselines.length,
        informationalBaselineCount: informationalBaselines.length,
    });
    assertFindingReferences(
        findings,
        packageDigest,
        [...baselines, ...informationalBaselines].map((entry) => entry.packageDigest),
        noBaselineReason,
    );
    const assessment = deriveCompatibilityReportAssessment({
        effectiveFindings: findings,
        releaseLevel,
        ...(noBaselineReason ? { noBaselineReason } : {}),
    });
    assertClaimedAssessment(input, assessment);
    return {
        schema: COMPATIBILITY_REPORT_V2_SCHEMA,
        ...parseReportHistoryFields(input, "compatibilityReport"),
        kind: packageKind(input.kind, "compatibilityReport.kind"),
        version: exactVersion(input.version, "compatibilityReport.version"),
        packageDigest,
        evaluator: parseVerificationPolicyIdentity(input.evaluator, "compatibilityReport.evaluator"),
        baselines,
        informationalBaselines,
        findings,
        ...assessment,
        releaseLevel,
        ...(noBaselineReason ? { noBaselineReason: noBaselineReason as CompatibilityNoBaselineReason } : {}),
        provenance: parseReportProvenance(input.provenance, "compatibilityReport.provenance"),
    };
}

export async function identifyCompatibilityReportV2(value: unknown) {
    const report = await parseCompatibilityReportV2(value);
    const identified = await identifyCanonicalVerificationContract(report);
    return { report, canonicalBytes: identified.canonicalBytes, digest: identified.digest };
}
