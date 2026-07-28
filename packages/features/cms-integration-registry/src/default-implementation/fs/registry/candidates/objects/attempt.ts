import {
    validateCandidateAdmissionJobResultForPlan,
    type AdmissionInputSnapshotV1,
    type CandidateAdmissionJobResultV1,
    type MigrationVerificationInputV1,
    type ReleaseAdmissionPolicySnapshotV1,
} from "@bernouy/cms-integration-verification";
import type { IntegrationRegistryCandidateRecord } from "cms-integration-registry/interfaces/publication";
import type { FsIntegrationRegistryCandidateLayout } from "../layout";
import { readCandidateAdmissionJobResult } from "./control";

export async function readCandidateAttemptObjects(
    layout: FsIntegrationRegistryCandidateLayout,
    record: IntegrationRegistryCandidateRecord,
    policy: ReleaseAdmissionPolicySnapshotV1 | undefined,
    admission: AdmissionInputSnapshotV1 | undefined,
    migrationInputs: readonly MigrationVerificationInputV1[],
): Promise<
    Readonly<{
        admissionJobResult?: CandidateAdmissionJobResultV1;
    }>
> {
    if (!record.admissionJobResultDigest) {
        return {};
    }
    const admissionJobResult = await readCandidateAdmissionJobResult(layout, record.admissionJobResultDigest);
    if (!policy || !admission) {
        throw new Error(`Candidate ${record.candidateId} result is missing persisted admission inputs`);
    }
    const verification = admissionJobResult.verification;
    const attempt = {
        jobId: verification.jobId,
        attemptId: verification.attemptId,
        fencingToken: verification.fencingToken,
    };
    const identified = await validateCandidateAdmissionJobResultForPlan(
        admissionJobResult,
        migrationInputs,
        admission,
        policy,
        attempt,
    );
    if (
        identified.digest !== record.admissionJobResultDigest ||
        verification.fencingToken > record.attemptCount ||
        (record.status !== "running" && verification.fencingToken !== record.attemptCount)
    ) {
        throw new Error(`Candidate ${record.candidateId} result does not match its record attempt`);
    }
    return { admissionJobResult };
}
