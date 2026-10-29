import type { DelegationRecord, DelegationStore } from "../interfaces";
import { DELEGATION_LIMITS } from "../limits";
type Pending = { record: DelegationRecord; closed: boolean; creation?: Promise<boolean> };

/** One authority process reserves bounded roots. Only consumed roots enter the durable quota store.
 * Restart loses unused reservations and therefore refuses those tickets; no bearer or secret is retained. */
export class DeferredDelegationStore implements DelegationStore {
    private readonly pending = new Map<string, Pending>();
    constructor(
        private readonly siteId: string,
        private readonly durable: DelegationStore,
    ) {}
    async create(record: DelegationRecord, now: number): Promise<boolean> {
        for (const [hash, entry] of this.pending) {
            if (entry.record.expiresAt <= now) {
                this.pending.delete(hash);
            }
        }
        if (
            record.siteId !== this.siteId ||
            record.source.siteId !== this.siteId ||
            record.expiresAt <= now ||
            this.pending.size >= DELEGATION_LIMITS.activeTicketsPerSite ||
            this.pending.has(record.hash)
        ) {
            return false;
        }
        this.pending.set(record.hash, { record: structuredClone(record), closed: false });
        return true;
    }
    async get(siteId: string, hash: string, now: number): Promise<DelegationRecord | null> {
        if (siteId !== this.siteId) {
            return null;
        }
        const entry = this.pending.get(hash);
        if (!entry) {
            return this.durable.get(siteId, hash, now);
        }
        if (entry.closed || entry.record.expiresAt <= now) {
            return null;
        }
        if (!entry.creation) {
            return structuredClone(entry.record);
        }
        const created = await entry.creation;
        return created && !entry.closed ? this.durable.get(siteId, hash, now) : null;
    }
    async consume(siteId: string, hash: string, now: number, bytes: number): Promise<boolean> {
        if (
            siteId !== this.siteId ||
            !Number.isSafeInteger(bytes) ||
            bytes < 0 ||
            bytes > DELEGATION_LIMITS.requestBytes
        ) {
            return false;
        }
        const entry = this.pending.get(hash);
        if (entry) {
            if (entry.closed || entry.record.expiresAt <= now) {
                return false;
            }
            entry.creation ??= Promise.resolve().then(() => this.durable.create(entry.record, now));
            if (!(await entry.creation) || entry.closed) {
                return false;
            }
        }
        return this.durable.consume(siteId, hash, now, bytes);
    }
    async close(siteId: string, hash: string, requestId: string): Promise<void> {
        if (siteId !== this.siteId) {
            return;
        }
        const entry = this.pending.get(hash);
        if (!entry) {
            await this.durable.close(siteId, hash, requestId);
            return;
        }
        if (entry.record.source.requestId !== requestId) {
            return;
        }
        entry.closed = true;
        if (entry.creation && (await entry.creation)) {
            await this.durable.close(siteId, hash, requestId);
        }
        if (this.pending.get(hash) === entry) {
            this.pending.delete(hash);
        }
    }
}
