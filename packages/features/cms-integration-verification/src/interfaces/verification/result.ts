import type { PinnedVerificationRunnerIdentity } from "../runner";

export const VERIFICATION_JOB_RESULT_SCHEMA = "cms.integration.verification-job-result.v1" as const;

export type VerificationJobSuiteResultV1 = Readonly<{
    suiteId: string;
    outcome: "passed" | "failed" | "skipped" | "infrastructure-failure";
    durationMs: number;
    attempts: number;
    cacheHit: boolean;
    evidenceDigests: readonly string[];
    diagnostics: readonly Readonly<{
        code: string;
        message: string;
        redacted: true;
    }>[];
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
