import type { Collection, Db } from "mongodb";
import type { DashboardRecord, DashboardRepository } from "../interfaces/DashboardRepository";

export class MongoDashboardRepository implements DashboardRepository {
    constructor(private readonly db: Db) {}

    async init(): Promise<void> {
        await this.records.createIndex({ siteId: 1, id: 1 }, { unique: true });
    }

    async list(siteId: string): Promise<DashboardRecord[]> {
        return (await this.records.find({ siteId }).sort({ name: 1 }).toArray()).map(({ _id, ...record }) => record);
    }

    async get(siteId: string, id: string): Promise<DashboardRecord | null> {
        const record = await this.records.findOne({ siteId, id });
        if (!record) {
            return null;
        }
        const { _id, ...value } = record;
        return value;
    }

    async create(record: DashboardRecord): Promise<void> {
        await this.records.insertOne({ ...record });
    }

    async replace(record: DashboardRecord, expectedRevision: number): Promise<boolean> {
        const result = await this.records.replaceOne(
            { siteId: record.siteId, id: record.id, revision: expectedRevision },
            { ...record },
        );
        return result.matchedCount === 1;
    }

    async delete(siteId: string, id: string, expectedRevision: number): Promise<boolean> {
        const result = await this.records.deleteOne({ siteId, id, revision: expectedRevision });
        return result.deletedCount === 1;
    }

    private get records(): Collection<DashboardRecord> {
        return this.db.collection<DashboardRecord>("dashboards");
    }
}
