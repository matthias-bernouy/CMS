import type { CmsRelation, DashboardRelationProjection } from "./Relation";

export interface RelationRepository {
    createRelation(relation: CmsRelation): Promise<CmsRelation>;
    updateRelation(relation: CmsRelation): Promise<CmsRelation | null>;
    deleteRelation(id: string): Promise<boolean>;
    getRelation(id: string): Promise<CmsRelation | null>;
    getRelationsForSource(sourceId: string): Promise<CmsRelation[]>;
    getAllRelations(): Promise<CmsRelation[]>;

    createDashboardRelationProjection(projection: DashboardRelationProjection): Promise<DashboardRelationProjection>;
    updateDashboardRelationProjection(projection: DashboardRelationProjection): Promise<DashboardRelationProjection | null>;
    deleteDashboardRelationProjection(id: string): Promise<boolean>;
    getDashboardRelationProjection(id: string): Promise<DashboardRelationProjection | null>;
    getDashboardRelationProjectionsForDashboard(dashboardId: string): Promise<DashboardRelationProjection[]>;
    getAllDashboardRelationProjections(): Promise<DashboardRelationProjection[]>;
}
