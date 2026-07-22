import type { DekRecord, DekRepository } from "@bernouy/envelope-crypto";

/** In-memory repository with counters for observing persistence and caching. */
export function makeDekRepo() {
    const rows = new Map<string, DekRecord>();
    const calls = { get: 0, create: 0 };
    const repo: DekRepository = {
        async get(scopeId) {
            calls.get++;
            return rows.get(scopeId) ?? null;
        },
        async create(record) {
            calls.create++;
            const existing = rows.get(record.scopeId);
            if (existing) {
                return existing;
            }
            rows.set(record.scopeId, record);
            return record;
        },
        async delete(scopeId) {
            rows.delete(scopeId);
        },
    };
    return { repo, rows, calls };
}
