import { canonicalJsonBytes } from "@bernouy/cms-integration-packages";
import type {
    AdmissionInputSnapshotV1,
    ReleaseAdmissionPolicySnapshotV1,
    VerificationJobAttemptIdentityV1,
    VerificationJobResultV1,
} from "../../../interfaces/verification";
import { compareText, invalidReference, samePinnedRunner } from "../shared";

export function assertAttempt(
    result: VerificationJobResultV1,
    admission: AdmissionInputSnapshotV1,
    attempt: VerificationJobAttemptIdentityV1,
): void {
    if (result.candidateId !== admission.candidate.candidateId) {
        invalidReference("jobResult.candidateId", "does not match the admission candidate");
    }
    if (
        result.jobId !== attempt.jobId ||
        result.attemptId !== attempt.attemptId ||
        result.fencingToken !== attempt.fencingToken
    ) {
        invalidReference("jobResult", "does not match the currently leased fenced attempt");
    }
}

export function assertBindings(
    result: VerificationJobResultV1,
    admission: AdmissionInputSnapshotV1,
    admissionDigest: string,
): void {
    const expected: VerificationJobResultV1["bindings"] = {
        admissionDigest,
        candidateDigest: admission.candidate.candidateDigest,
        packageDigest: admission.candidate.packageDigest,
        verificationDigest: admission.candidate.verificationDigest,
        policyDigest: admission.policyDigest,
        reviewedBaselineRevisionIds: admission.reviewedBaselines.map((entry) => entry.revisionId).toSorted(compareText),
        reviewedBaselineDigests: admission.reviewedBaselines.map((entry) => entry.baselineDigest).toSorted(compareText),
        reviewedObservedSchemaDigests: admission.reviewedBaselines
            .map((entry) => entry.observedSchemaDigest)
            .toSorted(compareText),
        dependencyDigests: admission.dependencies.map((entry) => entry.packageDigest).toSorted(compareText),
        activeContractDigests: admission.activeContracts.map((entry) => entry.contractDigest).toSorted(compareText),
        suiteContentDigests: admission.suites.map((entry) => entry.contentDigest).toSorted(compareText),
        catalogRevisionDigest: admission.catalogRevision.digest,
        compatibilityRevisionDigest: admission.compatibilityRevision.digest,
        compatibilityEvaluatorInputDigest: admission.compatibilityRevision.evaluatorInputDigest,
    };
    if (!sameBytes(canonicalJsonBytes(result.bindings), canonicalJsonBytes(expected))) {
        invalidReference("jobResult.bindings", "do not match the canonical admission inputs");
    }
}

export function assertRunnerAndSuites(
    result: VerificationJobResultV1,
    admission: AdmissionInputSnapshotV1,
    policy: ReleaseAdmissionPolicySnapshotV1,
): void {
    if (!samePinnedRunner(result.runner, admission.selectedRunner)) {
        invalidReference("jobResult.runner", "does not match the exact selected runner");
    }
    if (result.results.length !== admission.suites.length) {
        invalidReference("jobResult.results", "must contain every and only planned suite");
    }
    for (const suite of admission.suites) {
        if (!result.results.some((entry) => entry.suiteId === suite.suiteId)) {
            invalidReference("jobResult.results", `omits planned suite ${suite.suiteId}`);
        }
    }
    for (const suite of result.results) {
        if (suite.attempts > policy.retry.maximumAttempts) {
            invalidReference("jobResult.results.attempts", "exceeds the admission retry policy");
        }
        if (suite.cacheHit && (policy.cache.mode !== "passed-only" || suite.outcome !== "passed")) {
            invalidReference("jobResult.results.cacheHit", "is not permitted by the admission cache policy");
        }
        if (suite.cacheHit && suite.evidenceDigests.length < policy.cache.minimumConcordantRuns) {
            invalidReference("jobResult.results.evidenceDigests", "do not prove the required concordant cache runs");
        }
    }
}

function sameBytes(left: Uint8Array, right: Uint8Array): boolean {
    return left.byteLength === right.byteLength && left.every((byte, index) => byte === right[index]);
}
