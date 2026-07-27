import {
    validateCandidateAdmissionJobResultForPlan,
    validateVerificationJobResultForAdmission,
    type AdmissionInputSnapshotV1,
    type CandidateAdmissionJobResultV1,
    type MigrationVerificationInputV1,
    type ReleaseAdmissionPolicySnapshotV1,
    type VerificationJobResultV1,
} from "@bernouy/cms-integration-verification";
import type { IntegrationRegistryCandidateRecord } from "cms-integration-registry/interfaces/publication";
import type { FsIntegrationRegistryCandidateLayout } from "../layout";
import { readCandidateAdmissionJobResult, readCandidateVerificationJobResult } from "./control";

export async function readCandidateAttemptObjects(
    layout: FsIntegrationRegistryCandidateLayout,
    record: IntegrationRegistryCandidateRecord,
    policy: ReleaseAdmissionPolicySnapshotV1 | undefined,
    admission: AdmissionInputSnapshotV1 | undefined,
    migrationInputs: readonly MigrationVerificationInputV1[],
): Promise<
    Readonly<{
        admissionJobResult?: CandidateAdmissionJobResultV1;
        verificationJobResult?: VerificationJobResultV1;
    }>
> {
    if (!record.verificationJobResultDigest) {
        return {};
    }
    const admissionJobResult = record.admissionJobResultDigest
        ? await readCandidateAdmissionJobResult(layout, record.admissionJobResultDigest)
        : undefined;
    const verificationJobResult = await readCandidateVerificationJobResult(layout, record.verificationJobResultDigest);
    if (!policy || !admission) {
        throw new Error(`Candidate ${record.candidateId} result is missing persisted admission inputs`);
    }
    const attempt = {
        jobId: verificationJobResult.jobId,
        attemptId: verificationJobResult.attemptId,
        fencingToken: verificationJobResult.fencingToken,
    };
    const identified = admissionJobResult
        ? await validateCandidateAdmissionJobResultForPlan(
              admissionJobResult,
              migrationInputs,
              admission,
              policy,
              attempt,
          )
        : await validateVerificationJobResultForAdmission(verificationJobResult, admission, policy, attempt);
    if (
        (admissionJobResult
            ? identified.digest !== record.admissionJobResultDigest
            : identified.digest !== record.verificationJobResultDigest) ||
        verificationJobResult.fencingToken > record.attemptCount ||
        (record.status !== "running" && verificationJobResult.fencingToken !== record.attemptCount)
    ) {
        throw new Error(`Candidate ${record.candidateId} result does not match its record attempt`);
    }
    if (admissionJobResult) {
        const verification = await validateVerificationJobResultForAdmission(
            verificationJobResult,
            admission,
            policy,
            attempt,
        );
        const wrappedVerification = await validateVerificationJobResultForAdmission(
            admissionJobResult.verification,
            admission,
            policy,
            attempt,
        );
        if (
            verification.digest !== record.verificationJobResultDigest ||
            wrappedVerification.digest !== record.verificationJobResultDigest
        ) {
            throw new Error(`Candidate ${record.candidateId} verification result digest is inconsistent`);
        }
    }
    return { ...(admissionJobResult ? { admissionJobResult } : {}), verificationJobResult };
}
