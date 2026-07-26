import {
    advanceIntegrationRegistryCandidate,
    beginIntegrationRegistryCandidatePublication,
    claimIntegrationRegistryCandidate,
    completeIntegrationRegistryCandidatePublication,
    rejectIntegrationRegistryCandidatePublication,
    renewIntegrationRegistryCandidateLease,
} from "cms-integration-registry/core/publication/candidates/state";
import { IntegrationRegistryCandidateError } from "cms-integration-registry/core/publication/candidates/errors";
import { recoverExpiredIntegrationRegistryCandidateLease } from "cms-integration-registry/core/publication/candidates/recovery";
import type {
    ClaimIntegrationRegistryCandidateInput,
    CompleteIntegrationRegistryCandidateInput,
    CreateIntegrationRegistryCandidateInput,
    IntegrationRegistryCandidateObjects,
    IntegrationRegistryCandidateRecord,
    IntegrationRegistryCandidateStore,
    PersistIntegrationRegistryCandidatePlanningInput,
    QueueIntegrationRegistryCandidateInput,
    RejectIntegrationRegistryCandidateValidationInput,
} from "cms-integration-registry/interfaces/publication";
import { ensureFsIntegrationRegistryCandidateLayout, type FsIntegrationRegistryCandidateLayout } from "../layout";
import { readFsIntegrationRegistryCandidateObjects } from "../objects";
import { persistCandidatePlanningArtifacts } from "../objects";
import { withCandidateMutationLock } from "./lock";
import {
    completeStoredCandidate,
    createStoredCandidate,
    mutateStoredCandidate,
    queueStoredCandidate,
    requireCandidateRecord,
} from "./operations";
import {
    listClaimableCandidateRecords,
    listPublicationPendingCandidateRecords,
    readCandidateRecordOrNull,
    sweepDueCandidateExpirations,
    sweepExpiredCandidateLeases,
} from "./queries";

export type FsIntegrationRegistryCandidateStoreConfig = Readonly<{ root: string }>;

export class FsIntegrationRegistryCandidateStore implements IntegrationRegistryCandidateStore {
    #layout: Promise<FsIntegrationRegistryCandidateLayout> | undefined;

    constructor(private readonly config: FsIntegrationRegistryCandidateStoreConfig) {}

    async create(input: CreateIntegrationRegistryCandidateInput): Promise<IntegrationRegistryCandidateRecord> {
        const layout = await this.#loadLayout();
        return await withCandidateMutationLock(layout, () => createStoredCandidate(layout, input));
    }

    async get(candidateId: string): Promise<IntegrationRegistryCandidateRecord | null> {
        const layout = await this.#loadLayout();
        const record = await readCandidateRecordOrNull(layout, candidateId);
        if (record) {
            await readFsIntegrationRegistryCandidateObjects(layout, record);
        }
        return record;
    }

    async objects(candidateId: string): Promise<IntegrationRegistryCandidateObjects> {
        const layout = await this.#loadLayout();
        return await readFsIntegrationRegistryCandidateObjects(
            layout,
            await requireCandidateRecord(layout, candidateId),
        );
    }

    async persistPlanningArtifacts(
        candidateId: string,
        input: PersistIntegrationRegistryCandidatePlanningInput,
    ): Promise<Readonly<{ compatibilityReportDigest: string; statefulChangeSelectionDigest: string }>> {
        const layout = await this.#loadLayout();
        return await withCandidateMutationLock(layout, async () => {
            const record = await requireCandidateRecord(layout, candidateId);
            await readFsIntegrationRegistryCandidateObjects(layout, record);
            if (record.revision !== input.expectedRevision || record.status !== "validating") {
                throw new IntegrationRegistryCandidateError(
                    "revision_conflict",
                    `Candidate ${candidateId} is no longer at its expected validating revision`,
                );
            }
            const binding = await persistCandidatePlanningArtifacts(layout, record, input);
            return {
                compatibilityReportDigest: binding.compatibilityReportDigest,
                statefulChangeSelectionDigest: binding.statefulChangeSelectionDigest,
            };
        });
    }

    async listClaimable(now: string, limit = 100): Promise<readonly IntegrationRegistryCandidateRecord[]> {
        const layout = await this.#loadLayout();
        return await listClaimableCandidateRecords(layout, now, limit, (candidateId) => this.get(candidateId));
    }

    async listPublicationPending(limit = 100): Promise<readonly IntegrationRegistryCandidateRecord[]> {
        const layout = await this.#loadLayout();
        return await listPublicationPendingCandidateRecords(layout, limit, (candidateId) => this.get(candidateId));
    }

    async advanceValidation(
        candidateId: string,
        input: Readonly<{ expectedRevision: number; now: string }>,
    ): Promise<IntegrationRegistryCandidateRecord> {
        return await this.#mutate(candidateId, (record) =>
            advanceIntegrationRegistryCandidate(record, { ...input, status: "validating" }),
        );
    }

    async rejectValidation(
        candidateId: string,
        input: RejectIntegrationRegistryCandidateValidationInput,
    ): Promise<IntegrationRegistryCandidateRecord> {
        return await this.#mutate(candidateId, (record) =>
            advanceIntegrationRegistryCandidate(record, { ...input, status: "rejected" }),
        );
    }

    async queue(
        candidateId: string,
        input: QueueIntegrationRegistryCandidateInput,
    ): Promise<IntegrationRegistryCandidateRecord> {
        const layout = await this.#loadLayout();
        return await withCandidateMutationLock(layout, () => queueStoredCandidate(layout, candidateId, input));
    }

    async claim(
        candidateId: string,
        input: ClaimIntegrationRegistryCandidateInput,
    ): Promise<IntegrationRegistryCandidateRecord> {
        return await this.#mutate(candidateId, (record) => {
            const fencingToken = record.attemptCount + 1;
            if (!Number.isSafeInteger(fencingToken)) {
                throw new IntegrationRegistryCandidateError(
                    "invalid_candidate",
                    "Candidate attempts exceed safe fencing",
                );
            }
            return claimIntegrationRegistryCandidate(record, { ...input, fencingToken });
        });
    }

    async renew(
        candidateId: string,
        input: Parameters<typeof renewIntegrationRegistryCandidateLease>[1],
    ): Promise<IntegrationRegistryCandidateRecord> {
        return await this.#mutate(candidateId, (record) => renewIntegrationRegistryCandidateLease(record, input));
    }

    async complete(
        candidateId: string,
        input: CompleteIntegrationRegistryCandidateInput,
    ): Promise<IntegrationRegistryCandidateRecord> {
        const layout = await this.#loadLayout();
        return await withCandidateMutationLock(layout, () => completeStoredCandidate(layout, candidateId, input));
    }

    async beginPublication(
        candidateId: string,
        input: Parameters<typeof beginIntegrationRegistryCandidatePublication>[1],
    ): Promise<IntegrationRegistryCandidateRecord> {
        return await this.#mutate(candidateId, (record) => beginIntegrationRegistryCandidatePublication(record, input));
    }

    async completePublication(
        candidateId: string,
        input: Parameters<typeof completeIntegrationRegistryCandidatePublication>[1],
    ): Promise<IntegrationRegistryCandidateRecord> {
        return await this.#mutate(candidateId, (record) =>
            completeIntegrationRegistryCandidatePublication(record, input),
        );
    }

    async rejectPublication(
        candidateId: string,
        input: Parameters<typeof rejectIntegrationRegistryCandidatePublication>[1],
    ): Promise<IntegrationRegistryCandidateRecord> {
        return await this.#mutate(candidateId, (record) =>
            rejectIntegrationRegistryCandidatePublication(record, input),
        );
    }

    async recoverExpiredLease(
        candidateId: string,
        input: Parameters<typeof recoverExpiredIntegrationRegistryCandidateLease>[1],
    ): Promise<IntegrationRegistryCandidateRecord> {
        return await this.#mutate(candidateId, (record) =>
            recoverExpiredIntegrationRegistryCandidateLease(record, input),
        );
    }

    async recoverExpiredLeases(now: string, limit = 100): Promise<readonly IntegrationRegistryCandidateRecord[]> {
        const layout = await this.#loadLayout();
        return await sweepExpiredCandidateLeases(
            layout,
            now,
            limit,
            (candidateId) => this.get(candidateId),
            (candidateId, input) => this.recoverExpiredLease(candidateId, input),
        );
    }

    async expireDueCandidates(now: string, limit = 100): Promise<readonly IntegrationRegistryCandidateRecord[]> {
        const layout = await this.#loadLayout();
        return await sweepDueCandidateExpirations(
            layout,
            now,
            limit,
            (candidateId) => this.get(candidateId),
            (candidateId, expectedRevision, expirationTime) =>
                this.expire(candidateId, expectedRevision, expirationTime),
        );
    }

    async expire(
        candidateId: string,
        expectedRevision: number,
        now: string,
    ): Promise<IntegrationRegistryCandidateRecord> {
        return await this.#mutate(candidateId, (record) =>
            advanceIntegrationRegistryCandidate(record, { expectedRevision, status: "expired", now }),
        );
    }

    async #mutate(
        candidateId: string,
        transition: (record: IntegrationRegistryCandidateRecord) => IntegrationRegistryCandidateRecord,
    ): Promise<IntegrationRegistryCandidateRecord> {
        const layout = await this.#loadLayout();
        return await withCandidateMutationLock(layout, () => mutateStoredCandidate(layout, candidateId, transition));
    }

    #loadLayout(): Promise<FsIntegrationRegistryCandidateLayout> {
        this.#layout ??= ensureFsIntegrationRegistryCandidateLayout(this.config.root);
        return this.#layout;
    }
}
