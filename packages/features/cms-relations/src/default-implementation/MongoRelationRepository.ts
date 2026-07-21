import type { Collection, Db, OptionalUnlessRequiredId } from "mongodb";
import { DuplicateDashboardRelationProjectionError, DuplicateRelationError } from "../core/errors";
import { dashboardRelationProjectionId } from "../core/validateRelation";
import type { CmsRelation, DashboardRelationProjection } from "../interfaces/Relation";
import type { RelationRepository } from "../interfaces/RelationRepository";

export type MongoRelationRepositoryConfig = {
    collectionPrefix?: string;
};

type RelationDoc = Omit<CmsRelation, "id"> & { _id: string };
type DashboardRelationProjectionDoc = DashboardRelationProjection & { _id: string };

export class MongoRelationRepository implements RelationRepository {
    private readonly prefix: string;

    constructor(
        private readonly db: Db,
        config: MongoRelationRepositoryConfig = {},
    ) {
        this.prefix = config.collectionPrefix ?? "";
    }

    async init(): Promise<void> {
        await this.relations.createIndex({ "from.sourceId": 1 });
        await this.relations.createIndex({ "to.sourceId": 1 });
        await this.dashboardRelationProjections.createIndex({ dashboardId: 1 });
    }

    private get relations(): Collection<RelationDoc> {
        return this.db.collection<RelationDoc>(this.prefix + "relations");
    }

    private get dashboardRelationProjections(): Collection<DashboardRelationProjectionDoc> {
        return this.db.collection<DashboardRelationProjectionDoc>(this.prefix + "dashboard_relation_projections");
    }

    async createRelation(relation: CmsRelation): Promise<CmsRelation> {
        try {
            await this.relations.insertOne(toDoc(relation) as OptionalUnlessRequiredId<RelationDoc>);
        } catch (error) {
            if (isDuplicateKey(error)) {
                throw new DuplicateRelationError(relation.id);
            }
            throw error;
        }
        return structuredClone(relation);
    }

    async updateRelation(relation: CmsRelation): Promise<CmsRelation | null> {
        const { id: _id, ...rest } = relation;
        const doc = await this.relations.findOneAndReplace({ _id }, rest, { returnDocument: "after" });
        return fromDoc(doc);
    }

    async deleteRelation(id: string): Promise<boolean> {
        const result = await this.relations.deleteOne({ _id: id });
        return result.deletedCount > 0;
    }

    async getRelation(id: string): Promise<CmsRelation | null> {
        return fromDoc(await this.relations.findOne({ _id: id }));
    }

    async getRelationsForSource(sourceId: string): Promise<CmsRelation[]> {
        const docs = await this.relations
            .find({
                $or: [{ "from.sourceId": sourceId }, { "to.sourceId": sourceId }],
            })
            .toArray();
        return docs.map((doc) => fromDoc(doc)!);
    }

    async getAllRelations(): Promise<CmsRelation[]> {
        const docs = await this.relations.find().toArray();
        return docs.map((doc) => fromDoc(doc)!);
    }

    async createDashboardRelationProjection(
        projection: DashboardRelationProjection,
    ): Promise<DashboardRelationProjection> {
        const id = dashboardRelationProjectionId(projection);
        try {
            await this.dashboardRelationProjections.insertOne({
                _id: id,
                ...projection,
            } as OptionalUnlessRequiredId<DashboardRelationProjectionDoc>);
        } catch (error) {
            if (isDuplicateKey(error)) {
                throw new DuplicateDashboardRelationProjectionError(id);
            }
            throw error;
        }
        return structuredClone(projection);
    }

    async updateDashboardRelationProjection(
        projection: DashboardRelationProjection,
    ): Promise<DashboardRelationProjection | null> {
        const _id = dashboardRelationProjectionId(projection);
        const doc = await this.dashboardRelationProjections.findOneAndReplace({ _id }, projection, {
            returnDocument: "after",
        });
        return fromDashboardRelationProjectionDoc(doc);
    }

    async deleteDashboardRelationProjection(id: string): Promise<boolean> {
        const result = await this.dashboardRelationProjections.deleteOne({ _id: id });
        return result.deletedCount > 0;
    }

    async getDashboardRelationProjection(id: string): Promise<DashboardRelationProjection | null> {
        return fromDashboardRelationProjectionDoc(await this.dashboardRelationProjections.findOne({ _id: id }));
    }

    async getDashboardRelationProjectionsForDashboard(dashboardId: string): Promise<DashboardRelationProjection[]> {
        const docs = await this.dashboardRelationProjections.find({ dashboardId }).toArray();
        return docs.map((doc) => fromDashboardRelationProjectionDoc(doc)!);
    }

    async getAllDashboardRelationProjections(): Promise<DashboardRelationProjection[]> {
        const docs = await this.dashboardRelationProjections.find().toArray();
        return docs.map((doc) => fromDashboardRelationProjectionDoc(doc)!);
    }
}

function toDoc(relation: CmsRelation): RelationDoc {
    const { id, ...rest } = relation;
    return { _id: id, ...rest };
}

function fromDoc(doc: RelationDoc | null): CmsRelation | null {
    if (!doc) {
        return null;
    }
    const { _id, ...rest } = doc;
    return { id: _id, ...rest };
}

function fromDashboardRelationProjectionDoc(
    doc: DashboardRelationProjectionDoc | null,
): DashboardRelationProjection | null {
    if (!doc) {
        return null;
    }
    const { _id: _ignored, ...projection } = doc;
    return projection;
}

function isDuplicateKey(error: unknown): boolean {
    return !!error && typeof error === "object" && (error as { code?: number }).code === 11000;
}
