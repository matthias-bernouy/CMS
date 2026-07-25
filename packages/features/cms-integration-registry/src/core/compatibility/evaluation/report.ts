import { integrationVersionReleaseLevel, integrationVersionsShareMajor } from "@bernouy/cms-integrations";
import type {
    IntegrationCompatibilityBaselineReference,
    IntegrationCompatibilityEvaluationInput,
} from "../../../interfaces/compatibility";
import { compatibilityOutcome, compatibilityRequiredReleaseLevel, releaseLevelSatisfies } from "../changes";
import { candidateValidityEvidence, compareCompatibilityPackages } from "./comparison";
import {
    compatibilityBaselineReference,
    validateCompatibilityBaselineIdentity,
    validateEvaluationPackage,
} from "./input";

export function evaluateCompatibilityInput(input: IntegrationCompatibilityEvaluationInput) {
    validateEvaluationPackage(input.candidate, "candidate");
    const candidate = input.candidate.definition;
    const version = candidate.version!;
    if (input.noBaselineReason === "new-kind") {
        const evidence = candidateValidityEvidence(input.candidate);
        const invalid = compatibilityOutcome(evidence) === "invalid";
        return {
            kind: candidate.kind,
            version,
            packageDigest: input.candidate.packageDigest,
            baselines: [],
            informationalBaselines: [],
            evidence,
            outcome: invalid ? ("invalid" as const) : ("not-applicable" as const),
            requiredReleaseLevel: "none" as const,
            releaseLevel: "initial" as const,
            admissible: !invalid,
            noBaselineReason: "new-kind" as const,
        };
    }
    if (input.noBaselineReason === "new-major") {
        return evaluateNewMajor(input);
    }
    validateCompatibilityBaselineIdentity(input.baseline, input.candidate);
    const baselineVersion = input.baseline.definition.version!;
    const releaseLevel = integrationVersionReleaseLevel(baselineVersion, version);
    if (!releaseLevel || !integrationVersionsShareMajor(baselineVersion, version)) {
        throw new TypeError("An enforcing compatibility baseline must be an older version in the same major line");
    }
    const evidence = compareCompatibilityPackages(input.baseline, input.candidate, input.changedPaths);
    const outcome = compatibilityOutcome(evidence);
    const invalid = outcome === "invalid";
    const requiredReleaseLevel = invalid ? ("none" as const) : compatibilityRequiredReleaseLevel(evidence);
    const admissible = requiredReleaseLevel !== "none" && releaseLevelSatisfies(releaseLevel, requiredReleaseLevel);
    return {
        kind: candidate.kind,
        version,
        packageDigest: input.candidate.packageDigest,
        baselines: [compatibilityBaselineReference(input.baseline)],
        informationalBaselines: [],
        evidence,
        outcome,
        requiredReleaseLevel,
        releaseLevel,
        admissible,
    };
}

function evaluateNewMajor(input: Extract<IntegrationCompatibilityEvaluationInput, { noBaselineReason: "new-major" }>) {
    const informational = input.informationalBaseline;
    if (!informational) {
        return newMajorEvaluation(input, [], candidateValidityEvidence(input.candidate));
    }
    validateCompatibilityBaselineIdentity(informational, input.candidate);
    const releaseLevel = integrationVersionReleaseLevel(
        informational.definition.version!,
        input.candidate.definition.version!,
    );
    if (releaseLevel !== "major") {
        throw new TypeError("A new-major informational baseline must come from an older major line");
    }
    const evidence = compareCompatibilityPackages(informational, input.candidate, input.changedPaths);
    return newMajorEvaluation(input, [compatibilityBaselineReference(informational)], evidence);
}

function newMajorEvaluation(
    input: Extract<IntegrationCompatibilityEvaluationInput, { noBaselineReason: "new-major" }>,
    informationalBaselines: IntegrationCompatibilityBaselineReference[],
    evidence: ReturnType<typeof candidateValidityEvidence>,
) {
    const invalid = compatibilityOutcome(evidence) === "invalid";
    return {
        kind: input.candidate.definition.kind,
        version: input.candidate.definition.version!,
        packageDigest: input.candidate.packageDigest,
        baselines: [],
        informationalBaselines,
        evidence,
        outcome: invalid ? ("invalid" as const) : ("not-applicable" as const),
        requiredReleaseLevel: invalid ? ("none" as const) : ("major" as const),
        releaseLevel: "major" as const,
        admissible: !invalid,
        noBaselineReason: "new-major" as const,
    };
}
