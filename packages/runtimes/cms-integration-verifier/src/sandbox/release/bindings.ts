import type { VerificationJobResultV1 } from "@bernouy/cms-integration-verification";
import type { VerificationSandboxInput } from "../../supervisor";

export function verificationResultBindings(
    input: VerificationSandboxInput,
    admissionDigest: string,
): VerificationJobResultV1["bindings"] {
    const admission = input.workload.admission;
    return {
        admissionDigest,
        candidateDigest: admission.candidate.candidateDigest,
        packageDigest: admission.candidate.packageDigest,
        verificationDigest: admission.candidate.verificationDigest,
        policyDigest: admission.policyDigest,
        reviewedBaselineRevisionIds: admission.reviewedBaselines.map((entry) => entry.revisionId).toSorted(),
        reviewedBaselineDigests: admission.reviewedBaselines.map((entry) => entry.baselineDigest).toSorted(),
        reviewedObservedSchemaDigests: admission.reviewedBaselines
            .map((entry) => entry.observedSchemaDigest)
            .toSorted(),
        dependencyDigests: [...new Set(admission.dependencies.map((entry) => entry.packageDigest))].toSorted(),
        activeContractDigests: admission.activeContracts.map((entry) => entry.contractDigest).toSorted(),
        suiteContentDigests: admission.suites.map((entry) => entry.contentDigest).toSorted(),
        catalogRevisionDigest: admission.catalogRevision.digest,
        compatibilityRevisionDigest: admission.compatibilityRevision.digest,
        compatibilityEvaluatorInputDigest: admission.compatibilityRevision.evaluatorInputDigest,
        ...(admission.behavioralRlsPlan ? { behavioralRlsPlanDigest: admission.behavioralRlsPlan.digest } : {}),
        ...(admission.releaseVerificationPlan
            ? {
                  releaseVerificationPlanDigest: admission.releaseVerificationPlan.digest,
                  upgradeBaselineDigests: admission.releaseVerificationPlan.plan.baselines
                      .map((entry) => entry.packageDigest)
                      .toSorted(),
              }
            : {}),
    };
}
