import type {
    CompatibilityNoBaselineReason,
    CompatibilityReleaseLevel,
    CompatibilityReportAssessment,
    CompatibilityReportV2,
} from "../../interfaces/reports/compatibility";
import { COMPATIBILITY_REPORT_V2_SCHEMA } from "../../interfaces/reports/compatibility";
import { parseCompatibilityFinding } from "../finding";
import { parseVerificationPolicyIdentity } from "../runner";
import { IntegrationVerificationContractError } from "../validation/errors";
import { assertContractIJson, assertUnique, boundedArray, strictRecord } from "../validation/structure";
import { exactVersion, oneOf, packageKind, requiredBoolean, sha256Digest } from "../validation/values";
import { deriveCompatibilityReportAssessment } from "./compatibilityAssessment";
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
        ...assessment,
        releaseLevel,
        ...(noBaselineReason ? { noBaselineReason } : {}),
        provenance: parseReportProvenance(input.provenance, "compatibilityReport.provenance"),
    };
    return report;
}

function assertFindingReferences(
    findings: readonly Awaited<ReturnType<typeof parseCompatibilityFinding>>[],
    packageDigest: string,
    baselineDigests: readonly string[],
    noBaselineReason?: CompatibilityNoBaselineReason,
): void {
    for (const finding of findings) {
        const candidateOnlyInvalid =
            noBaselineReason === "new-kind" &&
            finding.classification === "invalid" &&
            finding.baselineDigest === packageDigest;
        if (
            finding.candidateDigest !== packageDigest ||
            (!baselineDigests.includes(finding.baselineDigest) && !candidateOnlyInvalid)
        ) {
            throw new IntegrationVerificationContractError(
                "invalid_reference",
                "compatibility finding must reference this candidate and one of this report's baselines",
                "compatibilityReport.findings",
            );
        }
    }
}

function assertClaimedAssessment(input: Record<string, unknown>, derived: CompatibilityReportAssessment): void {
    const claimed = {
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
        contractAdmissible: requiredBoolean(input.contractAdmissible, "compatibilityReport.contractAdmissible"),
    } satisfies CompatibilityReportAssessment;
    for (const field of ["outcome", "requiredReleaseLevel", "contractAdmissible"] as const) {
        if (claimed[field] !== derived[field]) {
            throw new IntegrationVerificationContractError(
                "invalid_contract",
                `compatibilityReport.${field} must be derived from effective findings and release semantics`,
                `compatibilityReport.${field}`,
            );
        }
    }
}

function assertBaselineSemantics(input: {
    releaseLevel: CompatibilityReleaseLevel;
    noBaselineReason?: CompatibilityNoBaselineReason;
    baselineCount: number;
    informationalBaselineCount: number;
}): void {
    if (input.releaseLevel === "initial") {
        if (
            input.noBaselineReason !== "new-kind" ||
            input.baselineCount !== 0 ||
            input.informationalBaselineCount !== 0
        ) {
            throw invalidSemantics("initial reports require new-kind and no comparison baseline");
        }
        return;
    }
    if (input.noBaselineReason === "new-kind") {
        throw invalidSemantics("new-kind is valid only for an initial release");
    }
    if (input.noBaselineReason === "new-major" && input.releaseLevel !== "major") {
        throw invalidSemantics("new-major is valid only for a major release");
    }
    if (input.noBaselineReason && input.baselineCount !== 0) {
        throw invalidSemantics("a report with noBaselineReason cannot carry a comparison baseline");
    }
    if (input.noBaselineReason === "new-major" && input.informationalBaselineCount > 1) {
        throw invalidSemantics("new-major accepts at most one informational baseline");
    }
    if (!input.noBaselineReason && input.informationalBaselineCount !== 0) {
        throw invalidSemantics("an enforcing comparison cannot also carry an informational baseline");
    }
    if (!input.noBaselineReason && input.baselineCount === 0) {
        throw invalidSemantics("a non-initial report requires a comparison baseline or noBaselineReason");
    }
}

function invalidSemantics(message: string): IntegrationVerificationContractError {
    return new IntegrationVerificationContractError("invalid_contract", message, "compatibilityReport");
}
