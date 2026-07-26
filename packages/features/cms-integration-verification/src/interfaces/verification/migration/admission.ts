import type { VerificationJobResultV1 } from "../result";
import type { MigrationJobResultV1 } from "./result";

export const CANDIDATE_ADMISSION_JOB_RESULT_SCHEMA = "cms.integration.candidate-admission-job-result.v1" as const;

export type CandidateAdmissionJobResultV1 = Readonly<{
    schema: typeof CANDIDATE_ADMISSION_JOB_RESULT_SCHEMA;
    verification: VerificationJobResultV1;
    migrations: readonly MigrationJobResultV1[];
}>;

export type IdentifiedCandidateAdmissionJobResultV1 = Readonly<{
    result: CandidateAdmissionJobResultV1;
    canonicalBytes: Uint8Array;
    digest: string;
}>;
