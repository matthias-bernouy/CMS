import type { DekRecord, DekRepository } from "@bernouy/envelope-crypto";

/** In-memory repository with counters for observing persistence and caching. */
export function makeDekRepo() {
    const rows = new Map<string, DekRecord>();
    const calls = { get: 0, create: 0, list: 0, rewrap: 0 };
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
        async list(cursor, limit) {
            calls.list++;
            const records = [...rows.values()]
                .filter((record) => cursor === null || record.scopeId > cursor)
                .sort((left, right) => left.scopeId.localeCompare(right.scopeId));
            const items = records.slice(0, limit);
            return {
                items,
                nextCursor: records.length > limit ? (items.at(-1)?.scopeId ?? null) : null,
            };
        },
        async rewrap(scopeId, expected, replacement) {
            calls.rewrap++;
            const current = rows.get(scopeId);
            if (!current || current.wrapped !== expected.wrapped || current.keyId !== expected.keyId) {
                return false;
            }
            rows.set(scopeId, { ...current, ...replacement });
            return true;
        },
        async delete(scopeId) {
            rows.delete(scopeId);
        },
    };
    return { repo, rows, calls };
}
