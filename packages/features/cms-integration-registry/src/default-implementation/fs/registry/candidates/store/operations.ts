import {
    createIntegrationRegistryCandidateRecord,
    queueIntegrationRegistryCandidate,
} from "cms-integration-registry/core/publication/candidates/state";
import type {
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
    persistCandidateMigrationInputs,
    persistCandidatePackageObjects,
    persistCandidatePlanningArtifacts,
    readFsIntegrationRegistryCandidateObjects,
} from "../objects";
import { assertCandidateRecordCapacity } from "./inventory";
import { requireCandidateRecord } from "./queries";
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
    const planningArtifacts = input.planningArtifacts;
    const queueInput = {
        expectedRevision: input.expectedRevision,
        now: input.now,
        policy: input.policy,
        admission: input.admission,
        ...(planningArtifacts ? { planningArtifacts } : {}),
        migrationInputs: [...(input.migrationInputs ?? [])],
    };
    const next = await queueIntegrationRegistryCandidate(current, queueInput);
    const planning = planningArtifacts ? await persistCandidatePlanningArtifacts(layout, planningArtifacts) : undefined;
    const persisted = await persistCandidateAdmissionObjects(layout, queueInput.policy, queueInput.admission);
    const migrationInputDigests = await persistCandidateMigrationInputs(layout, queueInput.migrationInputs);
    if (persisted.policyDigest !== next.policyDigest || persisted.admissionInputDigest !== next.admissionInputDigest) {
        corrupt("Candidate queued admission object digests changed during persistence");
    }
    if (!sameDigests(migrationInputDigests, next.migrationInputDigests ?? [])) {
        corrupt("Candidate queued migration input digests changed during persistence");
    }
    if (
        planning &&
        (planning.compatibilityReportDigest !== next.compatibilityReportDigest ||
            planning.statefulChangeSelectionDigest !== next.statefulChangeSelectionDigest)
    ) {
        corrupt("Candidate queued planning object digests changed during persistence");
    }
    await appendCandidateRecordRevision(layout, next);
    return next;
}

export async function mutateStoredCandidate(
    layout: FsIntegrationRegistryCandidateLayout,
    candidateId: string,
    transition: (
        record: IntegrationRegistryCandidateRecord,
        objects: IntegrationRegistryCandidateObjects,
    ) => IntegrationRegistryCandidateRecord,
): Promise<IntegrationRegistryCandidateRecord> {
    const current = await requireCandidateRecord(layout, candidateId);
    const objects = await readFsIntegrationRegistryCandidateObjects(layout, current);
    const next = transition(current, objects);
    await appendCandidateRecordRevision(layout, next);
    return next;
}

function sameDigests(left: readonly string[], right: readonly string[]): boolean {
    return left.length === right.length && left.every((digest, index) => digest === right[index]);
}

function corrupt(message: string): never {
    throw new FsIntegrationRegistryCandidateStoreError("corrupt_candidate", message);
}
