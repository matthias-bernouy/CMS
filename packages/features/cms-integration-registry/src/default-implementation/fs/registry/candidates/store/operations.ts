import { identifyReleaseAdmissionPolicySnapshot } from "@bernouy/cms-integration-verification";
import {
    createIntegrationRegistryCandidateRecord,
    queueIntegrationRegistryCandidate,
} from "cms-integration-registry/core/publication/candidates/state";
import type {
    CreateIntegrationRegistryCandidateInput,
    IntegrationRegistryCandidateRecord,
    QueueIntegrationRegistryCandidateInput,
} from "cms-integration-registry/interfaces/publication";
import { join } from "node:path";
import { unlink } from "node:fs/promises";
import { FsIntegrationRegistryCandidateStoreError } from "../errors";
import { appendCandidateRecordRevision, readCurrentCandidateRecord } from "../history";
import { candidatePlanningBindingPath, type FsIntegrationRegistryCandidateLayout } from "../layout";
import { syncDirectory } from "../../persistence/canonicalFile";
import {
    persistCandidateAdmissionObjects,
    persistCandidateMigrationInputs,
    persistCandidatePackageObjects,
    readCandidateCompatibilityReport,
    readCandidatePlanBinding,
    readCandidateStatefulSelection,
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
    const binding = await readCandidatePlanBinding(layout, candidateId);
    const planningArtifacts = binding ? await validatePlanningBinding(layout, current, input, binding) : undefined;
    const next = await queueIntegrationRegistryCandidate(current, {
        ...input,
        migrationInputs: input.migrationInputs ?? [],
        planningArtifacts,
    });
    const persisted = await persistCandidateAdmissionObjects(layout, input.policy, input.admission);
    const migrationInputDigests = await persistCandidateMigrationInputs(layout, input.migrationInputs ?? []);
    if (persisted.policyDigest !== next.policyDigest || persisted.admissionInputDigest !== next.admissionInputDigest) {
        corrupt("Candidate queued admission object digests changed during persistence");
    }
    if (!sameDigests(migrationInputDigests, next.migrationInputDigests ?? [])) {
        corrupt("Candidate queued migration input digests changed during persistence");
    }
    await appendCandidateRecordRevision(layout, next);
    if (binding) {
        await removeCandidatePlanBinding(layout, candidateId);
    }
    return next;
}

async function validatePlanningBinding(
    layout: FsIntegrationRegistryCandidateLayout,
    record: IntegrationRegistryCandidateRecord,
    input: QueueIntegrationRegistryCandidateInput,
    binding: Awaited<ReturnType<typeof readCandidatePlanBinding>> & {},
) {
    if (
        binding.expectedRevision !== input.expectedRevision ||
        binding.candidateDigest !== record.candidateDigest ||
        input.admission.compatibilityRevision.digest !== binding.compatibilityReportDigest ||
        input.admission.compatibilityRevision.evaluatorInputDigest !== binding.compatibilityEvaluatorInputDigest
    ) {
        corrupt("Candidate admission input does not bind its persisted planning artifacts");
    }
    const report = await readCandidateCompatibilityReport(layout, binding.compatibilityReportDigest);
    const selection = await readCandidateStatefulSelection(layout, binding.statefulChangeSelectionDigest);
    const policyDigest = (await identifyReleaseAdmissionPolicySnapshot(input.policy)).digest;
    if (
        report.reportId !== input.admission.compatibilityRevision.revisionId ||
        selection.policySnapshotDigest !== policyDigest ||
        selection.compatibilityReport.revisionId !== report.reportId ||
        selection.compatibilityReport.reportDigest !== binding.compatibilityReportDigest
    ) {
        corrupt("Candidate admission plan substituted an exact report, selection, or policy");
    }
    return {
        compatibilityReportDigest: binding.compatibilityReportDigest,
        statefulChangeSelectionDigest: binding.statefulChangeSelectionDigest,
    };
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
    if (next.status === "rejected" || next.status === "expired") {
        await removeCandidatePlanBinding(layout, candidateId);
    }
    return next;
}

async function removeCandidatePlanBinding(
    layout: FsIntegrationRegistryCandidateLayout,
    candidateId: string,
): Promise<void> {
    try {
        await unlink(candidatePlanningBindingPath(layout, candidateId));
        await syncDirectory(layout.plans);
    } catch (error) {
        if (!isNodeError(error) || error.code !== "ENOENT") {
            throw error;
        }
    }
}

function sameDigests(left: readonly string[], right: readonly string[]): boolean {
    return left.length === right.length && left.every((digest, index) => digest === right[index]);
}

function corrupt(message: string): never {
    throw new FsIntegrationRegistryCandidateStoreError("corrupt_candidate", message);
}

function isNodeError(value: unknown): value is NodeJS.ErrnoException {
    return value instanceof Error && "code" in value;
}
