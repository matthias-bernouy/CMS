import type { OAuthRecord, OAuthStore } from "../../interfaces/OAuthStore";

export class InMemoryOAuthStore implements OAuthStore {
    private readonly records = new Map<string, OAuthRecord>();
    async get(id: string) {
        return structuredClone(this.records.get(id) ?? null);
    }
    async create(record: OAuthRecord) {
        if (this.records.has(record.id)) {
            throw new Error("OAuth record already exists");
        }
        this.records.set(record.id, structuredClone(record));
    }
    async replace(record: OAuthRecord, expectedRevision: number) {
        if (this.records.get(record.id)?.revision !== expectedRevision) {
            return false;
        }
        this.records.set(record.id, structuredClone(record));
        return true;
    }
    async pruneExpired(now: number) {
        for (const [id, record] of this.records) {
            if (record.expiresAt <= now) {
                this.records.delete(id);
            }
        }
    }
    async list(
        prefix: string,
        limit: number,
        subjectId?: string,
        options: { after?: string; expiresAfter?: number } = {},
    ) {
        return structuredClone(
            [...this.records.values()]
                .filter(
                    (record) =>
                        record.id.startsWith(prefix) &&
                        (!options.after || record.id > options.after) &&
                        (options.expiresAfter === undefined || record.expiresAt > options.expiresAfter) &&
                        (!subjectId || (record.value as { subjectId?: string }).subjectId === subjectId),
                )
                .sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))
                .slice(0, limit),
        );
    }
}
