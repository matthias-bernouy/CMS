import { assertVerificationJobResultReplay } from "@bernouy/cms-integration-verification";
import {
    completeIntegrationRegistryCandidateAttempt,
    createIntegrationRegistryCandidateRecord,
    queueIntegrationRegistryCandidate,
} from "cms-integration-registry/core/publication/candidates/state";
import { IntegrationRegistryCandidateError } from "cms-integration-registry/core/publication/candidates/errors";
import type {
    CompleteIntegrationRegistryCandidateInput,
    CreateIntegrationRegistryCandidateInput,
    IntegrationRegistryCandidateObjects,
    IntegrationRegistryCandidateRecord,
    QueueIntegrationRegistryCandidateInput,
} from "cms-integration-registry/interfaces/publication";
import { join } from "node:path";
import { FsIntegrationRegistryCandidateStoreError } from "../errors";
import { appendCandidateRecordRevision, readCurrentCandidateRecord } from "../history";
import type { FsIntegrationRegistryCandidateLayout } from "../layout";
import {
    persistCandidateAdmissionObjects,
    persistCandidatePackageObjects,
    persistCandidateVerificationJobResult,
    readFsIntegrationRegistryCandidateObjects,
} from "../objects";
import { assertCandidateRecordCapacity } from "./inventory";
import { readPrunedCandidate } from "../recovery/retention";

export async function createStoredCandidate(
    layout: FsIntegrationRegistryCandidateLayout,
    input: CreateIntegrationRegistryCandidateInput,
): Promise<IntegrationRegistryCandidateRecord> {
    if (
        (await readCurrentCandidateRecord(layout, input.candidateId)) ||
        (await readPrunedCandidate(join(layout.pruned, `${input.candidateId}.json`)))
    ) {
        throw new FsIntegrationRegistryCandidateStoreError(
            "candidate_exists",
            `Candidate ${input.candidateId} already exists`,
        );
    }
    await assertCandidateRecordCapacity(layout);
    const candidate = await persistCandidatePackageObjects(layout, input.candidate);
    const record = createIntegrationRegistryCandidateRecord({ ...input, candidate });
    await appendCandidateRecordRevision(layout, record);
    return record;
}

export async function queueStoredCandidate(
    layout: FsIntegrationRegistryCandidateLayout,
    candidateId: string,
    input: QueueIntegrationRegistryCandidateInput,
): Promise<IntegrationRegistryCandidateRecord> {
    const current = await requireCandidateRecord(layout, candidateId);
    await readFsIntegrationRegistryCandidateObjects(layout, current);
    const next = await queueIntegrationRegistryCandidate(current, input);
    const persisted = await persistCandidateAdmissionObjects(layout, input.policy, input.admission);
    if (persisted.policyDigest !== next.policyDigest || persisted.admissionInputDigest !== next.admissionInputDigest) {
        corrupt("Candidate queued admission object digests changed during persistence");
    }
    await appendCandidateRecordRevision(layout, next);
    return next;
}

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
    });
    const digest = await persistCandidateVerificationJobResult(layout, input.result);
    if (next.verificationJobResultDigest !== digest) {
        corrupt("Candidate completion result digest changed during persistence");
    }
    await appendCandidateRecordRevision(layout, next);
    return next;
}

export async function mutateStoredCandidate(
    layout: FsIntegrationRegistryCandidateLayout,
    candidateId: string,
    transition: (record: IntegrationRegistryCandidateRecord) => IntegrationRegistryCandidateRecord,
): Promise<IntegrationRegistryCandidateRecord> {
    const current = await requireCandidateRecord(layout, candidateId);
    await readFsIntegrationRegistryCandidateObjects(layout, current);
    const next = transition(current);
    await appendCandidateRecordRevision(layout, next);
    return next;
}

export async function requireCandidateRecord(
    layout: FsIntegrationRegistryCandidateLayout,
    candidateId: string,
): Promise<IntegrationRegistryCandidateRecord> {
    const record = await readCurrentCandidateRecord(layout, candidateId);
    if (!record) {
        throw new FsIntegrationRegistryCandidateStoreError(
            "candidate_not_found",
            `Candidate ${candidateId} does not exist`,
        );
    }
    return record;
}

function replayCompletedAttempt(
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
    return assertVerificationJobResultReplay(objects.verificationJobResult, input.result).then(() => record);
}

function corrupt(message: string): never {
    throw new FsIntegrationRegistryCandidateStoreError("corrupt_candidate", message);
}
