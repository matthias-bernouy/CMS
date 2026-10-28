import type { DelegationRecord, DelegationStore } from "./interfaces";

export class InMemoryDelegationStore implements DelegationStore {
    private readonly records = new Map<string, { record: DelegationRecord; calls: number; bytes: number }>();
    async create(record: DelegationRecord, now: number) {
        for (const [key, entry] of this.records) {
            if (entry.record.expiresAt <= now) {
                this.records.delete(key);
            }
        }
        if (this.records.size >= 256 || this.records.has(record.hash)) {
            return false;
        }
        this.records.set(record.hash, { record: structuredClone(record), calls: 0, bytes: 0 });
        return true;
    }
    async get(siteId: string, hash: string, now: number) {
        const entry = this.records.get(hash);
        return entry?.record.siteId === siteId && entry.record.expiresAt > now ? structuredClone(entry.record) : null;
    }
    async consume(siteId: string, hash: string, now: number, bytes: number) {
        const entry = this.records.get(hash);
        if (
            !entry ||
            entry.record.siteId !== siteId ||
            entry.record.expiresAt <= now ||
            !Number.isSafeInteger(bytes) ||
            bytes < 0 ||
            entry.calls >= 32 ||
            entry.bytes + bytes > 4 * 1024 * 1024
        ) {
            return false;
        }
        entry.calls++;
        entry.bytes += bytes;
        return true;
    }
    async close(siteId: string, hash: string, requestId: string) {
        const entry = this.records.get(hash);
        if (entry?.record.siteId === siteId && entry.record.source.requestId === requestId) {
            this.records.delete(hash);
        }
    }
}
