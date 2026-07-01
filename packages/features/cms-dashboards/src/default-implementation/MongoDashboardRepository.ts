import type { Collection, Db, OptionalUnlessRequiredId } from "mongodb";
import { DuplicateDashboardError } from "../core/errors";
import type { Dashboard } from "../interfaces/Dashboard";
import type { DashboardRepository } from "../interfaces/DashboardRepository";

export type MongoDashboardRepositoryConfig = {
    collectionPrefix?: string;
};

type DashboardDoc = Omit<Dashboard, "id"> & { _id: string };

export class MongoDashboardRepository implements DashboardRepository {
    private readonly prefix: string;

    constructor(
        private readonly db: Db,
        config: MongoDashboardRepositoryConfig = {},
    ) {
        this.prefix = config.collectionPrefix ?? "";
    }

    async init(): Promise<void> {
        await this.dashboards.createIndex({ source: 1 });
    }

    private get dashboards(): Collection<DashboardDoc> {
        return this.db.collection<DashboardDoc>(this.prefix + "dashboards");
    }

    async createDashboard(dashboard: Dashboard): Promise<Dashboard> {
        try {
            await this.dashboards.insertOne(toDoc(dashboard) as OptionalUnlessRequiredId<DashboardDoc>);
        } catch (error) {
            if (isDuplicateKey(error)) throw new DuplicateDashboardError(dashboard.id);
            throw error;
        }
        return structuredClone(dashboard);
    }

    async updateDashboard(dashboard: Dashboard): Promise<Dashboard | null> {
        const { id: _id, ...rest } = dashboard;
        const doc = await this.dashboards.findOneAndReplace(
            { _id },
            rest,
            { returnDocument: "after" },
        );
        return fromDoc(doc);
    }

    async deleteDashboard(id: string): Promise<boolean> {
        const result = await this.dashboards.deleteOne({ _id: id });
        return result.deletedCount > 0;
    }

    async getDashboard(id: string): Promise<Dashboard | null> {
        return fromDoc(await this.dashboards.findOne({ _id: id }));
    }

    async getDashboardsForSource(sourceId: string): Promise<Dashboard[]> {
        const docs = await this.dashboards.find({ source: sourceId }).toArray();
        return docs.map(doc => fromDoc(doc)!);
    }

    async getAllDashboards(): Promise<Dashboard[]> {
        const docs = await this.dashboards.find().toArray();
        return docs.map(doc => fromDoc(doc)!);
    }
}

function toDoc(dashboard: Dashboard): DashboardDoc {
    const { id, ...rest } = dashboard;
    return { _id: id, ...rest };
}

function fromDoc(doc: DashboardDoc | null): Dashboard | null {
    if (!doc) return null;
    const { _id, ...rest } = doc;
    return { id: _id, ...rest };
}

function isDuplicateKey(error: unknown): boolean {
    return !!error && typeof error === "object" && (error as { code?: number }).code === 11000;
}
