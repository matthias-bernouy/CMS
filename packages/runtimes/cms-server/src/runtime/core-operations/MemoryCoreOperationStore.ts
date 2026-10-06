import type { CoreOperationPage, CoreOperationRecord, CoreOperationStore } from "./types";

export class MemoryCoreOperationStore implements CoreOperationStore {
    readonly #records = new Map<string, CoreOperationRecord>();

    async createOrGet(candidate: CoreOperationRecord): Promise<{ record: CoreOperationRecord; created: boolean }> {
        const existing = [...this.#records.values()].find(
            (record) =>
                record.siteId === candidate.siteId &&
                record.contractId === candidate.contractId &&
                record.capabilityId === candidate.capabilityId &&
                record.idempotencyKey === candidate.idempotencyKey,
        );
        if (existing) {
            return { record: clone(existing), created: false };
        }
        this.#records.set(candidate.id, clone(candidate));
        return { record: clone(candidate), created: true };
    }

    async get(siteId: string, id: string): Promise<CoreOperationRecord | null> {
        const record = this.#records.get(id);
        return record?.siteId === siteId ? clone(record) : null;
    }

    async list(siteId: string, cursor: string | undefined, limit: number): Promise<CoreOperationPage> {
        const records = [...this.#records.values()]
            .filter((record) => record.siteId === siteId && (!cursor || record.id < cursor))
            .sort((left, right) => right.id.localeCompare(left.id))
            .slice(0, limit + 1);
        const hasMore = records.length > limit;
        const items = records.slice(0, limit).map(clone);
        return { items, ...(hasMore ? { nextCursor: items.at(-1)!.id } : {}) };
    }

    async listRecoverable(now: string, limit: number): Promise<readonly CoreOperationRecord[]> {
        return [...this.#records.values()]
            .filter(
                (record) =>
                    record.status === "queued" || (record.status === "running" && record.lease!.expiresAt <= now),
            )
            .sort((left, right) => left.id.localeCompare(right.id))
            .slice(0, limit)
            .map(clone);
    }

    async claim(id: string, revision: number, token: string, expiresAt: string, now: string): Promise<boolean> {
        const record = this.#records.get(id);
        if (
            !record ||
            record.revision !== revision ||
            (record.status !== "queued" && !(record.status === "running" && record.lease!.expiresAt <= now))
        ) {
            return false;
        }
        this.#records.set(id, {
            ...record,
            status: "running",
            revision: revision + 1,
            updatedAt: now,
            lease: { token, expiresAt },
        });
        return true;
    }

    renew(id: string, token: string, expiresAt: string, now: string): Promise<boolean> {
        return this.#ownedUpdate(id, token, (record) => ({ ...record, updatedAt: now, lease: { token, expiresAt } }));
    }

    succeed(id: string, token: string, result: unknown, now: string): Promise<boolean> {
        return this.#ownedUpdate(id, token, (record) => ({
            ...record,
            status: "succeeded",
            revision: record.revision + 1,
            updatedAt: now,
            result: structuredClone(result),
            lease: undefined,
        }));
    }

    fail(id: string, token: string, errorCode: string, now: string): Promise<boolean> {
        return this.#ownedUpdate(id, token, (record) => ({
            ...record,
            status: "failed",
            revision: record.revision + 1,
            updatedAt: now,
            errorCode,
            lease: undefined,
        }));
    }

    async #ownedUpdate(
        id: string,
        token: string,
        update: (record: CoreOperationRecord) => CoreOperationRecord,
    ): Promise<boolean> {
        const record = this.#records.get(id);
        if (record?.status !== "running" || record.lease?.token !== token) {
            return false;
        }
        this.#records.set(id, update(record));
        return true;
    }
}

function clone(record: CoreOperationRecord): CoreOperationRecord {
    return structuredClone(record);
}
