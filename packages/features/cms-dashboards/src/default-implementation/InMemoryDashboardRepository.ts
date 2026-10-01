import type { DashboardRecord, DashboardRepository } from "../interfaces/DashboardRepository";

export class InMemoryDashboardRepository implements DashboardRepository {
    private readonly records = new Map<string, DashboardRecord>();

    async list(siteId: string): Promise<DashboardRecord[]> {
        return [...this.records.values()].filter((item) => item.siteId === siteId).map((item) => structuredClone(item));
    }

    async get(siteId: string, id: string): Promise<DashboardRecord | null> {
        const record = this.records.get(`${siteId}:${id}`);
        return record ? structuredClone(record) : null;
    }

    async create(record: DashboardRecord): Promise<void> {
        const key = `${record.siteId}:${record.id}`;
        if (this.records.has(key)) {
            throw Object.assign(new Error("Dashboard already exists"), { status: 409 });
        }
        this.records.set(key, structuredClone(record));
    }

    async replace(record: DashboardRecord, expectedRevision: number): Promise<boolean> {
        const key = `${record.siteId}:${record.id}`;
        const current = this.records.get(key);
        if (!current || current.revision !== expectedRevision || record.revision !== expectedRevision + 1) {
            return false;
        }
        this.records.set(key, structuredClone(record));
        return true;
    }

    async delete(siteId: string, id: string, expectedRevision: number): Promise<boolean> {
        const key = `${siteId}:${id}`;
        const current = this.records.get(key);
        return Boolean(current?.revision === expectedRevision && this.records.delete(key));
    }
}
