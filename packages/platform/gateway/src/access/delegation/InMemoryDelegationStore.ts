import { DELEGATION_LIMITS } from "cms-gateway/access/delegation/limits";
import type { DelegationRecord, DelegationStore } from "./interfaces";

export class InMemoryDelegationStore implements DelegationStore {
    private readonly records = new Map<string, { record: DelegationRecord; calls: number; bytes: number }>();
    async create(record: DelegationRecord, now: number) {
        for (const [key, entry] of this.records) {
            if (entry.record.expiresAt <= now) {
                this.records.delete(key);
            }
        }
        if (
            [...this.records.values()].filter((entry) => entry.record.siteId === record.siteId).length >=
                DELEGATION_LIMITS.activeTicketsPerSite ||
            this.records.has(`${record.siteId}:${record.hash}`)
        ) {
            return false;
        }
        this.records.set(`${record.siteId}:${record.hash}`, { record: structuredClone(record), calls: 0, bytes: 0 });
        return true;
    }
    async get(siteId: string, hash: string, now: number) {
        const entry = this.records.get(`${siteId}:${hash}`);
        return entry?.record.siteId === siteId && entry.record.expiresAt > now ? structuredClone(entry.record) : null;
    }
    async consume(siteId: string, hash: string, now: number, bytes: number) {
        const entry = this.records.get(`${siteId}:${hash}`);
        if (
            !entry ||
            entry.record.siteId !== siteId ||
            entry.record.expiresAt <= now ||
            !Number.isSafeInteger(bytes) ||
            bytes < 0 ||
            entry.calls >= DELEGATION_LIMITS.childCalls ||
            entry.bytes + bytes > DELEGATION_LIMITS.requestBytes
        ) {
            return false;
        }
        entry.calls++;
        entry.bytes += bytes;
        return true;
    }
    async close(siteId: string, hash: string, requestId: string) {
        const entry = this.records.get(`${siteId}:${hash}`);
        if (entry?.record.siteId === siteId && entry.record.source.requestId === requestId) {
            this.records.delete(`${siteId}:${hash}`);
        }
    }
}
