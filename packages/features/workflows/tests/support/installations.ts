import type { WorkflowInstallation, WorkflowInstallationStore } from "@bernouy/workflows";
export class MemoryWorkflowInstallations implements WorkflowInstallationStore {
    readonly records = new Map<string, WorkflowInstallation>();
    async create(record: WorkflowInstallation) {
        const existing = this.records.get(record.id);
        if (existing) {
            return structuredClone(existing);
        }
        this.records.set(record.id, structuredClone(record));
        return record;
    }
    async get(id: string) {
        return structuredClone(this.records.get(id) ?? null);
    }
    async list(cursor: string | undefined, limit: number) {
        const rows = [...this.records.values()]
            .filter((row) => !cursor || row.id > cursor)
            .sort((a, b) => a.id.localeCompare(b.id));
        return {
            items: structuredClone(rows.slice(0, limit)),
            ...(rows.length > limit ? { nextCursor: rows[limit - 1]!.id } : {}),
        };
    }
    async pending(limit: number) {
        return structuredClone(
            [...this.records.values()]
                .filter((row) => row.state === "removing" || row.pendingPublication !== null)
                .slice(0, limit),
        );
    }
    async replace(record: WorkflowInstallation, revision: number) {
        if (
            this.records.get(record.id)?.revision !== revision ||
            this.records.get(record.id)?.pendingPublication !== null
        ) {
            return false;
        }
        this.records.set(record.id, structuredClone(record));
        return true;
    }
    async finishPublication(id: string, revision: number) {
        const record = this.records.get(id);
        if (record?.pendingPublication === revision) {
            this.records.set(id, { ...record, pendingPublication: null });
        }
    }
    async markPublished(id: string, revision: number) {
        const record = this.records.get(id);
        if (!record || record.revision !== revision || record.pendingPublication !== null) {
            return false;
        }
        this.records.set(id, { ...record, publishedRevision: revision, pendingPublication: revision });
        return true;
    }
}
