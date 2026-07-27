import { identifyCandidateAdmissionJobResult } from "@bernouy/cms-integration-verification";
import { IntegrationRegistryCandidateError } from "cms-integration-registry/core/publication/candidates/errors";
import {
    asCandidateAdmissionJobResult,
    completeIntegrationRegistryCandidateAttempt,
} from "cms-integration-registry/core/publication/candidates/state";
import type {
    CompleteIntegrationRegistryCandidateInput,
    IntegrationRegistryCandidateObjects,
    IntegrationRegistryCandidateRecord,
} from "cms-integration-registry/interfaces/publication";
import { FsIntegrationRegistryCandidateStoreError } from "../errors";
import { appendCandidateRecordRevision } from "../history";
import type { FsIntegrationRegistryCandidateLayout } from "../layout";
import {
    persistCandidateAdmissionJobResult,
    persistCandidateVerificationJobResult,
    readFsIntegrationRegistryCandidateObjects,
} from "../objects";
import { requireCandidateRecord } from "./queries";

export async function completeStoredCandidate(
    layout: FsIntegrationRegistryCandidateLayout,
    candidateId: string,
    input: CompleteIntegrationRegistryCandidateInput,
): Promise<IntegrationRegistryCandidateRecord> {
    const current = await requireCandidateRecord(layout, candidateId);
    const objects = await readFsIntegrationRegistryCandidateObjects(layout, current);
    if (current.status !== "running") {
        return await replayCompletedAttempt(current, objects, input);
    }
    if (!objects.policy || !objects.admission) {
        corrupt(`Candidate ${candidateId} is running without persisted admission inputs`);
    }
    const next = await completeIntegrationRegistryCandidateAttempt(current, {
        ...input,
        policy: objects.policy,
        admission: objects.admission,
        migrationInputs: objects.migrationInputs,
    });
    const admissionResult = asCandidateAdmissionJobResult(input.result);
    const digest = await persistCandidateAdmissionJobResult(layout, admissionResult);
    const verificationDigest = await persistCandidateVerificationJobResult(layout, admissionResult.verification);
    if (next.admissionJobResultDigest !== digest) {
        corrupt("Candidate completion result digest changed during persistence");
    }
    if (next.verificationJobResultDigest !== verificationDigest) {
        corrupt("Candidate verification result digest changed during persistence");
    }
    await appendCandidateRecordRevision(layout, next);
    return next;
}

async function replayCompletedAttempt(
    record: IntegrationRegistryCandidateRecord,
    objects: IntegrationRegistryCandidateObjects,
    input: CompleteIntegrationRegistryCandidateInput,
): Promise<IntegrationRegistryCandidateRecord> {
    if (
        record.lease ||
        !record.verificationJobResultDigest ||
        !objects.verificationJobResult ||
        record.revision !== input.expectedRevision + 1
    ) {
        throw new IntegrationRegistryCandidateError("lease_conflict", "Candidate attempt lease is no longer current");
    }
    if (!objects.admissionJobResult) {
        throw new IntegrationRegistryCandidateError("lease_conflict", "Candidate exact admission result is missing");
    }
    const [existing, replay] = await Promise.all([
        identifyCandidateAdmissionJobResult(objects.admissionJobResult),
        identifyCandidateAdmissionJobResult(asCandidateAdmissionJobResult(input.result)),
    ]);
    if (existing.digest !== replay.digest) {
        throw new IntegrationRegistryCandidateError("lease_conflict", "Candidate result replay changed bytes");
    }
    return record;
}

function corrupt(message: string): never {
    throw new FsIntegrationRegistryCandidateStoreError("corrupt_candidate", message);
}
