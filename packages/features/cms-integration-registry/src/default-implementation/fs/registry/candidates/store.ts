import {
    advanceIntegrationRegistryCandidate,
    claimIntegrationRegistryCandidate,
    completeIntegrationRegistryCandidateAttempt,
    createIntegrationRegistryCandidateRecord,
    renewIntegrationRegistryCandidateLease,
} from "cms-integration-registry/core/publication/candidates/state";
import { IntegrationRegistryCandidateError } from "cms-integration-registry/core/publication/candidates/errors";
import { recoverExpiredIntegrationRegistryCandidateLease } from "cms-integration-registry/core/publication/candidates/recovery";
import type {
    CreateIntegrationRegistryCandidateInput,
    IntegrationRegistryCandidateRecord,
} from "cms-integration-registry/interfaces/publication";
import { readdir } from "node:fs/promises";
import { readVerifiedRegistryDirectory } from "../persistence/ownedDirectory";
import { FsIntegrationRegistryCandidateStoreError } from "./errors";
import { appendCandidateRecordRevision, readCurrentCandidateRecord } from "./history";
import {
    assertCandidateId,
    ensureFsIntegrationRegistryCandidateLayout,
    FS_INTEGRATION_REGISTRY_CANDIDATE_INVENTORY_LIMIT,
    type FsIntegrationRegistryCandidateLayout,
} from "./layout";
import {
    persistFsIntegrationRegistryCandidateObjects,
    readFsIntegrationRegistryCandidateObjects,
    type FsIntegrationRegistryCandidateObjects,
} from "./objects";

export type FsIntegrationRegistryCandidateStoreConfig = Readonly<{ root: string }>;

export class FsIntegrationRegistryCandidateStore {
    #layout: Promise<FsIntegrationRegistryCandidateLayout> | undefined;

    constructor(private readonly config: FsIntegrationRegistryCandidateStoreConfig) {}

    async create(input: CreateIntegrationRegistryCandidateInput): Promise<IntegrationRegistryCandidateRecord> {
        const layout = await this.#loadLayout();
        if (await readCurrentCandidateRecord(layout, input.candidateId)) {
            throw new FsIntegrationRegistryCandidateStoreError(
                "candidate_exists",
                `Candidate ${input.candidateId} already exists`,
            );
        }
        const candidate = await persistFsIntegrationRegistryCandidateObjects(layout, input.candidate);
        const record = createIntegrationRegistryCandidateRecord({ ...input, candidate });
        await appendCandidateRecordRevision(layout, record);
        return record;
    }

    async get(candidateId: string): Promise<IntegrationRegistryCandidateRecord | null> {
        const layout = await this.#loadLayout();
        const record = await readCurrentCandidateRecord(layout, candidateId);
        if (record) {
            await readFsIntegrationRegistryCandidateObjects(layout, record);
        }
        return record;
    }

    async objects(candidateId: string): Promise<FsIntegrationRegistryCandidateObjects> {
        const layout = await this.#loadLayout();
        return await readFsIntegrationRegistryCandidateObjects(layout, await requireRecord(layout, candidateId));
    }

    async listClaimable(now: string, limit = 100): Promise<readonly IntegrationRegistryCandidateRecord[]> {
        const currentTime = canonicalTimestamp(now);
        if (!Number.isSafeInteger(limit) || limit < 1 || limit > FS_INTEGRATION_REGISTRY_CANDIDATE_INVENTORY_LIMIT) {
            throw new TypeError("Candidate claimable limit must be a positive bounded safe integer");
        }
        const layout = await this.#loadLayout();
        await readVerifiedRegistryDirectory(layout.records);
        const entries = await readdir(layout.records, { withFileTypes: true });
        if (entries.length > FS_INTEGRATION_REGISTRY_CANDIDATE_INVENTORY_LIMIT) {
            throw new FsIntegrationRegistryCandidateStoreError(
                "inventory_limit",
                "Candidate inventory exceeds its configured limit",
            );
        }
        const result: IntegrationRegistryCandidateRecord[] = [];
        for (const entry of entries.toSorted((left, right) => compareText(left.name, right.name))) {
            if (!entry.isDirectory() || entry.isSymbolicLink()) {
                throw new FsIntegrationRegistryCandidateStoreError(
                    "corrupt_candidate",
                    `Candidate inventory contains unexpected entry ${entry.name}`,
                );
            }
            assertCandidateId(entry.name);
            const record = await this.get(entry.name);
            if (record?.status === "queued" && currentTime < Date.parse(record.expiresAt)) {
                result.push(record);
                if (result.length === limit) {
                    break;
                }
            }
        }
        return Object.freeze(result);
    }

    async advance(
        candidateId: string,
        input: Parameters<typeof advanceIntegrationRegistryCandidate>[1],
    ): Promise<IntegrationRegistryCandidateRecord> {
        return await this.#mutate(candidateId, (record) => advanceIntegrationRegistryCandidate(record, input));
    }

    async claim(
        candidateId: string,
        input: Readonly<{
            expectedRevision: number;
            jobId: string;
            attemptId: string;
            workerId: string;
            now: string;
            leaseExpiresAt: string;
        }>,
    ): Promise<IntegrationRegistryCandidateRecord> {
        return await this.#mutate(candidateId, (record) => {
            if (Date.parse(input.now) >= Date.parse(record.expiresAt)) {
                throw new IntegrationRegistryCandidateError("invalid_candidate", "Expired candidate cannot be claimed");
            }
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
        input: Parameters<typeof completeIntegrationRegistryCandidateAttempt>[1],
    ): Promise<IntegrationRegistryCandidateRecord> {
        return await this.#mutate(candidateId, (record) => completeIntegrationRegistryCandidateAttempt(record, input));
    }

    async recoverExpiredLease(
        candidateId: string,
        input: Parameters<typeof recoverExpiredIntegrationRegistryCandidateLease>[1],
    ): Promise<IntegrationRegistryCandidateRecord> {
        return await this.#mutate(candidateId, (record) =>
            recoverExpiredIntegrationRegistryCandidateLease(record, input),
        );
    }

    async expire(
        candidateId: string,
        expectedRevision: number,
        now: string,
    ): Promise<IntegrationRegistryCandidateRecord> {
        return await this.advance(candidateId, { expectedRevision, status: "expired", now });
    }

    async #mutate(
        candidateId: string,
        transition: (record: IntegrationRegistryCandidateRecord) => IntegrationRegistryCandidateRecord,
    ): Promise<IntegrationRegistryCandidateRecord> {
        const layout = await this.#loadLayout();
        const current = await requireRecord(layout, candidateId);
        await readFsIntegrationRegistryCandidateObjects(layout, current);
        const next = transition(current);
        await appendCandidateRecordRevision(layout, next);
        return next;
    }

    #loadLayout(): Promise<FsIntegrationRegistryCandidateLayout> {
        this.#layout ??= ensureFsIntegrationRegistryCandidateLayout(this.config.root);
        return this.#layout;
    }
}

async function requireRecord(
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

function canonicalTimestamp(value: string): number {
    const parsed = Date.parse(value);
    if (!Number.isFinite(parsed) || new Date(parsed).toISOString() !== value) {
        throw new TypeError("Candidate store time must be a canonical ISO timestamp");
    }
    return parsed;
}

function compareText(left: string, right: string): number {
    return left < right ? -1 : left > right ? 1 : 0;
}
