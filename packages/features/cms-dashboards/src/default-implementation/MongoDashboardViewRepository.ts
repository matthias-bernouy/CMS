import type { Collection, Db, OptionalUnlessRequiredId } from "mongodb";
import { DuplicateDashboardViewError } from "../core/errors";
import type { DashboardViewDefinition } from "../interfaces/Dashboard";
import type { DashboardViewRepository } from "../interfaces/DashboardViewRepository";

export type MongoDashboardViewRepositoryConfig = {
    collectionPrefix?: string;
};

type DashboardViewDoc = Omit<DashboardViewDefinition, "id"> & { _id: string };

export class MongoDashboardViewRepository implements DashboardViewRepository {
    private readonly prefix: string;

    constructor(
        private readonly db: Db,
        config: MongoDashboardViewRepositoryConfig = {},
    ) {
        this.prefix = config.collectionPrefix ?? "";
    }

    async init(): Promise<void> {
        await Promise.all([
            this.views.createIndex({ source: 1 }),
            this.views.createIndex({ "origin.integrationId": 1 }),
        ]);
    }

    async createView(view: DashboardViewDefinition): Promise<DashboardViewDefinition> {
        try {
            await this.views.insertOne(toDoc(view) as OptionalUnlessRequiredId<DashboardViewDoc>);
        } catch (error) {
            if (isDuplicateKey(error)) {
                throw new DuplicateDashboardViewError(view.id);
            }
            throw error;
        }
        return structuredClone(view);
    }

    async updateView(view: DashboardViewDefinition): Promise<DashboardViewDefinition | null> {
        const { id: _id, ...rest } = view;
        return fromDoc(await this.views.findOneAndReplace({ _id }, rest, { returnDocument: "after" }));
    }

    async deleteView(id: string): Promise<boolean> {
        return (await this.views.deleteOne({ _id: id })).deletedCount > 0;
    }

    async getView(id: string): Promise<DashboardViewDefinition | null> {
        return fromDoc(await this.views.findOne({ _id: id }));
    }

    async getViewsForSource(sourceId: string): Promise<DashboardViewDefinition[]> {
        return (await this.views.find({ source: sourceId }).toArray()).map((view) => fromDoc(view)!);
    }

    async getAllViews(): Promise<DashboardViewDefinition[]> {
        return (await this.views.find().toArray()).map((view) => fromDoc(view)!);
    }

    private get views(): Collection<DashboardViewDoc> {
        return this.db.collection<DashboardViewDoc>(this.prefix + "dashboardViews");
    }
}

function toDoc(view: DashboardViewDefinition): DashboardViewDoc {
    const { id, ...rest } = view;
    return { _id: id, ...rest };
}

function fromDoc(doc: DashboardViewDoc | null): DashboardViewDefinition | null {
    if (!doc) {
        return null;
    }
    const { _id, ...rest } = doc;
    return { id: _id, ...rest };
}

function isDuplicateKey(error: unknown): boolean {
    return !!error && typeof error === "object" && (error as { code?: number }).code === 11000;
}
