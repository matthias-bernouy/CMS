import type { CompatibilityFinding } from "../../interfaces/finding";
import type {
    CompatibilityNoBaselineReason,
    CompatibilityReleaseLevel,
    CompatibilityReportAssessment,
    CompatibilityReportOutcome,
    CompatibilityRequiredReleaseLevel,
} from "../../interfaces/reports/compatibility";

export function deriveCompatibilityReportAssessment(input: {
    effectiveFindings: readonly CompatibilityFinding[];
    releaseLevel: CompatibilityReleaseLevel;
    noBaselineReason?: CompatibilityNoBaselineReason;
}): CompatibilityReportAssessment {
    const hasInvalidFinding = input.effectiveFindings.some((finding) => finding.classification === "invalid");
    if (input.noBaselineReason === "new-kind") {
        return hasInvalidFinding ? invalidAssessment() : notApplicableAssessment("none");
    }
    if (input.noBaselineReason === "new-major") {
        return hasInvalidFinding ? invalidAssessment() : notApplicableAssessment("major");
    }

    const outcome = compatibilityOutcome(input.effectiveFindings);
    if (outcome === "invalid") {
        return invalidAssessment();
    }
    const requiredReleaseLevel = requiredReleaseLevelFor(input.effectiveFindings);
    return Object.freeze({
        outcome,
        requiredReleaseLevel,
        contractAdmissible: releaseLevelSatisfies(input.releaseLevel, requiredReleaseLevel),
    });
}

function compatibilityOutcome(findings: readonly CompatibilityFinding[]): CompatibilityReportOutcome {
    if (findings.some((finding) => finding.classification === "invalid")) {
        return "invalid";
    }
    if (findings.some((finding) => finding.classification === "unknown")) {
        return "unknown";
    }
    if (findings.some((finding) => finding.classification === "breaking")) {
        return "breaking";
    }
    return "compatible";
}

function requiredReleaseLevelFor(
    findings: readonly CompatibilityFinding[],
): Exclude<CompatibilityRequiredReleaseLevel, "none"> {
    if (findings.some((finding) => finding.classification === "breaking" || finding.classification === "unknown")) {
        return "major";
    }
    if (findings.some((finding) => finding.classification === "additive")) {
        return "minor";
    }
    return "patch";
}

function releaseLevelSatisfies(
    actual: CompatibilityReleaseLevel,
    required: Exclude<CompatibilityRequiredReleaseLevel, "none">,
): boolean {
    if (actual === "initial") {
        return false;
    }
    const rank = { patch: 0, minor: 1, major: 2 } as const;
    return rank[actual] >= rank[required];
}

function invalidAssessment(): CompatibilityReportAssessment {
    return Object.freeze({ outcome: "invalid", requiredReleaseLevel: "none", contractAdmissible: false });
}

function notApplicableAssessment(requiredReleaseLevel: "none" | "major"): CompatibilityReportAssessment {
    return Object.freeze({ outcome: "not-applicable", requiredReleaseLevel, contractAdmissible: true });
}
