import {
    advanceIntegrationRegistryCandidate,
    claimIntegrationRegistryCandidate,
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
    QueueIntegrationRegistryCandidateInput,
    RejectIntegrationRegistryCandidateValidationInput,
} from "cms-integration-registry/interfaces/publication";
import { ensureFsIntegrationRegistryCandidateLayout, type FsIntegrationRegistryCandidateLayout } from "../layout";
import { readFsIntegrationRegistryCandidateObjects } from "../objects";
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

    async listClaimable(now: string, limit = 100): Promise<readonly IntegrationRegistryCandidateRecord[]> {
        const layout = await this.#loadLayout();
        return await listClaimableCandidateRecords(layout, now, limit, (candidateId) => this.get(candidateId));
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
