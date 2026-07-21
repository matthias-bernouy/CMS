import { DuplicateDashboardRelationProjectionError, DuplicateRelationError } from "../core/errors";
import { dashboardRelationProjectionId } from "../core/validateRelation";
import type { CmsRelation, DashboardRelationProjection } from "../interfaces/Relation";
import type { RelationRepository } from "../interfaces/RelationRepository";

export class InMemoryRelationRepository implements RelationRepository {
    private readonly relations = new Map<string, CmsRelation>();
    private readonly dashboardRelationProjections = new Map<string, DashboardRelationProjection>();

    async createRelation(relation: CmsRelation): Promise<CmsRelation> {
        if (this.relations.has(relation.id)) {
            throw new DuplicateRelationError(relation.id);
        }
        this.relations.set(relation.id, structuredClone(relation));
        return structuredClone(relation);
    }

    async updateRelation(relation: CmsRelation): Promise<CmsRelation | null> {
        if (!this.relations.has(relation.id)) {
            return null;
        }
        this.relations.set(relation.id, structuredClone(relation));
        return structuredClone(relation);
    }

    async deleteRelation(id: string): Promise<boolean> {
        return this.relations.delete(id);
    }

    async getRelation(id: string): Promise<CmsRelation | null> {
        const found = this.relations.get(id);
        return found ? structuredClone(found) : null;
    }

    async getRelationsForSource(sourceId: string): Promise<CmsRelation[]> {
        return Array.from(this.relations.values())
            .filter((relation) => relation.from.sourceId === sourceId || relation.to.sourceId === sourceId)
            .map((relation) => structuredClone(relation));
    }

    async getAllRelations(): Promise<CmsRelation[]> {
        return Array.from(this.relations.values(), (relation) => structuredClone(relation));
    }

    async createDashboardRelationProjection(
        projection: DashboardRelationProjection,
    ): Promise<DashboardRelationProjection> {
        const id = dashboardRelationProjectionId(projection);
        if (this.dashboardRelationProjections.has(id)) {
            throw new DuplicateDashboardRelationProjectionError(id);
        }
        this.dashboardRelationProjections.set(id, structuredClone(projection));
        return structuredClone(projection);
    }

    async updateDashboardRelationProjection(
        projection: DashboardRelationProjection,
    ): Promise<DashboardRelationProjection | null> {
        const id = dashboardRelationProjectionId(projection);
        if (!this.dashboardRelationProjections.has(id)) {
            return null;
        }
        this.dashboardRelationProjections.set(id, structuredClone(projection));
        return structuredClone(projection);
    }

    async deleteDashboardRelationProjection(id: string): Promise<boolean> {
        return this.dashboardRelationProjections.delete(id);
    }

    async getDashboardRelationProjection(id: string): Promise<DashboardRelationProjection | null> {
        const found = this.dashboardRelationProjections.get(id);
        return found ? structuredClone(found) : null;
    }

    async getDashboardRelationProjectionsForDashboard(dashboardId: string): Promise<DashboardRelationProjection[]> {
        return Array.from(this.dashboardRelationProjections.values())
            .filter((projection) => projection.dashboardId === dashboardId)
            .map((projection) => structuredClone(projection));
    }

    async getAllDashboardRelationProjections(): Promise<DashboardRelationProjection[]> {
        return Array.from(this.dashboardRelationProjections.values(), (projection) => structuredClone(projection));
    }
}
