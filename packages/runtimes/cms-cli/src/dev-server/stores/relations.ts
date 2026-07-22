import { existsSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import {
    dashboardRelationProjectionId,
    DuplicateDashboardRelationProjectionError,
    DuplicateRelationError,
    type CmsRelation,
    type DashboardRelationProjection,
    type RelationRepository,
} from "@bernouy/cms-relations";
import { isDashboardRelationProjection, isRelation } from "../relationShapes";

const GENERATED_RELATIONS_FILE = ".p9r/generated/relations.json";
const GENERATED_DASHBOARD_RELATION_PROJECTIONS_FILE = ".p9r/generated/dashboard-relation-projections.json";

export class LocalFsRelationRepository implements RelationRepository {
    private readonly file: string;
    private readonly dashboardRelationProjectionsFile: string;

    constructor(siteDir: string) {
        this.file = join(siteDir, GENERATED_RELATIONS_FILE);
        this.dashboardRelationProjectionsFile = join(siteDir, GENERATED_DASHBOARD_RELATION_PROJECTIONS_FILE);
    }

    async createRelation(relation: CmsRelation): Promise<CmsRelation> {
        const relations = await this.readAll();
        if (relations.some((candidate) => candidate.id === relation.id)) {
            throw new DuplicateRelationError(relation.id);
        }
        relations.push(structuredClone(relation));
        await this.writeAll(relations);
        return structuredClone(relation);
    }

    async updateRelation(relation: CmsRelation): Promise<CmsRelation | null> {
        const relations = await this.readAll();
        const index = relations.findIndex((candidate) => candidate.id === relation.id);
        if (index < 0) {
            return null;
        }
        relations[index] = structuredClone(relation);
        await this.writeAll(relations);
        return structuredClone(relation);
    }

    async deleteRelation(id: string): Promise<boolean> {
        const relations = await this.readAll();
        const next = relations.filter((relation) => relation.id !== id);
        if (next.length === relations.length) {
            return false;
        }
        await this.writeAll(next);
        return true;
    }

    async getRelation(id: string): Promise<CmsRelation | null> {
        const found = (await this.readAll()).find((relation) => relation.id === id);
        return found ? structuredClone(found) : null;
    }

    async getRelationsForSource(sourceId: string): Promise<CmsRelation[]> {
        return (await this.readAll())
            .filter((relation) => relation.from.sourceId === sourceId || relation.to.sourceId === sourceId)
            .map((relation) => structuredClone(relation));
    }

    async getAllRelations(): Promise<CmsRelation[]> {
        return (await this.readAll()).map((relation) => structuredClone(relation));
    }

    async createDashboardRelationProjection(
        projection: DashboardRelationProjection,
    ): Promise<DashboardRelationProjection> {
        const projections = await this.readAllDashboardRelationProjections();
        const id = dashboardRelationProjectionId(projection);
        if (projections.some((candidate) => dashboardRelationProjectionId(candidate) === id)) {
            throw new DuplicateDashboardRelationProjectionError(id);
        }
        projections.push(structuredClone(projection));
        await this.writeAllDashboardRelationProjections(projections);
        return structuredClone(projection);
    }

    async updateDashboardRelationProjection(
        projection: DashboardRelationProjection,
    ): Promise<DashboardRelationProjection | null> {
        const projections = await this.readAllDashboardRelationProjections();
        const id = dashboardRelationProjectionId(projection);
        const index = projections.findIndex((candidate) => dashboardRelationProjectionId(candidate) === id);
        if (index < 0) {
            return null;
        }
        projections[index] = structuredClone(projection);
        await this.writeAllDashboardRelationProjections(projections);
        return structuredClone(projection);
    }

    async deleteDashboardRelationProjection(id: string): Promise<boolean> {
        const projections = await this.readAllDashboardRelationProjections();
        const next = projections.filter((projection) => dashboardRelationProjectionId(projection) !== id);
        if (next.length === projections.length) {
            return false;
        }
        await this.writeAllDashboardRelationProjections(next);
        return true;
    }

    async getDashboardRelationProjection(id: string): Promise<DashboardRelationProjection | null> {
        const found = (await this.readAllDashboardRelationProjections()).find(
            (projection) => dashboardRelationProjectionId(projection) === id,
        );
        return found ? structuredClone(found) : null;
    }

    async getDashboardRelationProjectionsForDashboard(dashboardId: string): Promise<DashboardRelationProjection[]> {
        return (await this.readAllDashboardRelationProjections())
            .filter((projection) => projection.dashboardId === dashboardId)
            .map((projection) => structuredClone(projection));
    }

    async getAllDashboardRelationProjections(): Promise<DashboardRelationProjection[]> {
        return (await this.readAllDashboardRelationProjections()).map((projection) => structuredClone(projection));
    }

    private async readAll(): Promise<CmsRelation[]> {
        if (!existsSync(this.file)) {
            return [];
        }
        const parsed = JSON.parse(await readFile(this.file, "utf-8")) as unknown;
        if (!Array.isArray(parsed)) {
            return [];
        }
        return parsed.filter(isRelation).map((relation) => structuredClone(relation));
    }

    private async writeAll(relations: CmsRelation[]): Promise<void> {
        await mkdir(dirname(this.file), { recursive: true });
        await writeFile(this.file, `${JSON.stringify(relations, null, 4)}\n`, "utf-8");
    }

    private async readAllDashboardRelationProjections(): Promise<DashboardRelationProjection[]> {
        if (!existsSync(this.dashboardRelationProjectionsFile)) {
            return [];
        }
        const parsed = JSON.parse(await readFile(this.dashboardRelationProjectionsFile, "utf-8")) as unknown;
        if (!Array.isArray(parsed)) {
            return [];
        }
        return parsed.filter(isDashboardRelationProjection).map((projection) => structuredClone(projection));
    }

    private async writeAllDashboardRelationProjections(projections: DashboardRelationProjection[]): Promise<void> {
        await mkdir(dirname(this.dashboardRelationProjectionsFile), { recursive: true });
        await writeFile(this.dashboardRelationProjectionsFile, `${JSON.stringify(projections, null, 4)}\n`, "utf-8");
    }
}
