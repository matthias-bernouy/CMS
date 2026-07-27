import type {
    CompatibilityNoBaselineReason,
    CompatibilityReleaseLevel,
    CompatibilityReportAssessment,
} from "../../../interfaces/reports/compatibility";
import type { parseCompatibilityFinding } from "../../finding";
import { IntegrationVerificationContractError } from "../../validation/errors";
import { oneOf, requiredBoolean } from "../../validation/values";

export function assertFindingReferences(
    findings: readonly Awaited<ReturnType<typeof parseCompatibilityFinding>>[],
    packageDigest: string,
    baselineDigests: readonly string[],
    noBaselineReason?: CompatibilityNoBaselineReason,
): void {
    for (const finding of findings) {
        const candidateOnlyFinding =
            noBaselineReason !== undefined && baselineDigests.length === 0 && finding.baselineDigest === packageDigest;
        if (
            finding.candidateDigest !== packageDigest ||
            (!baselineDigests.includes(finding.baselineDigest) && !candidateOnlyFinding)
        ) {
            throw new IntegrationVerificationContractError(
                "invalid_reference",
                "compatibility finding must reference this candidate and one of this report's baselines",
                "compatibilityReport.findings",
            );
        }
    }
}

export function assertClaimedAssessment(input: Record<string, unknown>, derived: CompatibilityReportAssessment): void {
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

export function assertBaselineSemantics(input: {
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
