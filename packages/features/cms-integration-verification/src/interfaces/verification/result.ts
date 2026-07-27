import type { PinnedVerificationRunnerIdentity } from "../runner";
import type { PlatformVerificationEvidenceV1 } from "./platform";

export const VERIFICATION_JOB_RESULT_SCHEMA = "cms.integration.verification-job-result.v1" as const;

export type VerificationJobSuiteResultV1 = Readonly<{
    suiteId: string;
    outcome: "passed" | "failed" | "skipped" | "not-applicable" | "infrastructure-failure";
    durationMs: number;
    attempts: number;
    cacheHit: boolean;
    evidenceDigests: readonly string[];
    diagnostics: readonly Readonly<{
        code: string;
        message: string;
        redacted: true;
    }>[];
    /** Present on new policy-generated suites; absent on legacy job results. */
    platformEvidence?: PlatformVerificationEvidenceV1;
}>;

export type VerificationJobResultV1 = Readonly<{
    schema: typeof VERIFICATION_JOB_RESULT_SCHEMA;
    candidateId: string;
    jobId: string;
    attemptId: string;
    fencingToken: number;
    bindings: Readonly<{
        admissionDigest: string;
        candidateDigest: string;
        packageDigest: string;
        verificationDigest: string;
        policyDigest: string;
        reviewedBaselineRevisionIds: readonly string[];
        reviewedBaselineDigests: readonly string[];
        reviewedObservedSchemaDigests: readonly string[];
        dependencyDigests: readonly string[];
        activeContractDigests: readonly string[];
        suiteContentDigests: readonly string[];
        catalogRevisionDigest: string;
        compatibilityRevisionDigest: string;
        compatibilityEvaluatorInputDigest: string;
        /** Missing only when the corresponding legacy admission has no behavioral RLS plan. */
        behavioralRlsPlanDigest?: string;
    }>;
    runner: PinnedVerificationRunnerIdentity;
    environment: Readonly<{
        digest: string;
        versions: readonly Readonly<{
            name: string;
            version: string;
        }>[];
    }>;
    results: readonly VerificationJobSuiteResultV1[];
}>;

export type IdentifiedVerificationJobResultV1 = Readonly<{
    result: VerificationJobResultV1;
    canonicalBytes: Uint8Array;
    digest: string;
}>;

export type VerificationJobAttemptIdentityV1 = Readonly<{
    jobId: string;
    attemptId: string;
    fencingToken: number;
}>;
