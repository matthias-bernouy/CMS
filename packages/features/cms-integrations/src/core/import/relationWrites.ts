import {
    dashboardRelationProjectionId,
    DuplicateRelationError,
    type CmsRelation,
    type DashboardRelationProjection,
    type RelationRepository,
} from "@bernouy/cms-relations";
import { IntegrationRuntimeError } from "../errors";
import type { IntegrationArtifactResult } from "../../interfaces/IntegrationImport";

export type IntegrationRelationWrite = {
    relation: CmsRelation;
    previous: CmsRelation | null;
};

export type IntegrationDashboardRelationProjectionWrite = {
    projection: DashboardRelationProjection;
    previous: DashboardRelationProjection | null;
};

export function writeRelationsWithRollback(
    relationRepository: RelationRepository,
    writes: IntegrationRelationWrite[],
): Promise<IntegrationArtifactResult[]>;
export function writeRelationsWithRollback<T>(
    relationRepository: RelationRepository,
    writes: IntegrationRelationWrite[],
    operation: (artifacts: IntegrationArtifactResult[]) => Promise<T>,
): Promise<T>;
export async function writeRelationsWithRollback<T>(
    relationRepository: RelationRepository,
    writes: IntegrationRelationWrite[],
    operation?: (artifacts: IntegrationArtifactResult[]) => Promise<T>,
): Promise<T> {
    const completed: IntegrationRelationWrite[] = [];
    const artifacts: IntegrationArtifactResult[] = [];

    try {
        for (const write of writes) {
            if (write.previous) {
                const updated = await relationRepository.updateRelation(write.relation);
                if (!updated) {
                    throw new IntegrationRuntimeError(`relation disappeared during import: ${write.relation.id}`, 409);
                }
                completed.push(write);
                artifacts.push({ type: "relation", id: write.relation.id, action: "updated" });
            } else {
                await relationRepository.createRelation(write.relation);
                completed.push(write);
                artifacts.push({ type: "relation", id: write.relation.id, action: "created" });
            }
        }
        return operation ? await operation(artifacts) : (artifacts as T);
    } catch (error) {
        await rollbackRelations(relationRepository, completed);
        throw error;
    }
}

async function rollbackRelations(
    relationRepository: RelationRepository,
    completed: IntegrationRelationWrite[],
): Promise<void> {
    for (const write of completed.reverse()) {
        try {
            if (write.previous) {
                await relationRepository.updateRelation(write.previous);
            } else {
                await relationRepository.deleteRelation(write.relation.id);
            }
        } catch {
            // Best-effort rollback: keep restoring remaining relations.
        }
    }
}

export function writeDashboardRelationProjectionsWithRollback(
    relationRepository: RelationRepository,
    writes: IntegrationDashboardRelationProjectionWrite[],
): Promise<IntegrationArtifactResult[]>;
export function writeDashboardRelationProjectionsWithRollback<T>(
    relationRepository: RelationRepository,
    writes: IntegrationDashboardRelationProjectionWrite[],
    operation: (artifacts: IntegrationArtifactResult[]) => Promise<T>,
): Promise<T>;
export async function writeDashboardRelationProjectionsWithRollback<T>(
    relationRepository: RelationRepository,
    writes: IntegrationDashboardRelationProjectionWrite[],
    operation?: (artifacts: IntegrationArtifactResult[]) => Promise<T>,
): Promise<T> {
    const completed: IntegrationDashboardRelationProjectionWrite[] = [];
    const artifacts: IntegrationArtifactResult[] = [];

    try {
        for (const write of writes) {
            const id = dashboardRelationProjectionId(write.projection);
            if (write.previous) {
                const updated = await relationRepository.updateDashboardRelationProjection(write.projection);
                if (!updated) {
                    throw new IntegrationRuntimeError(
                        `dashboard relation projection disappeared during import: ${id}`,
                        409,
                    );
                }
                completed.push(write);
                artifacts.push({ type: "dashboardRelation", id, action: "updated" });
            } else {
                await relationRepository.createDashboardRelationProjection(write.projection);
                completed.push(write);
                artifacts.push({ type: "dashboardRelation", id, action: "created" });
            }
        }
        return operation ? await operation(artifacts) : (artifacts as T);
    } catch (error) {
        await rollbackDashboardRelationProjections(relationRepository, completed);
        throw error;
    }
}

async function rollbackDashboardRelationProjections(
    relationRepository: RelationRepository,
    completed: IntegrationDashboardRelationProjectionWrite[],
): Promise<void> {
    for (const write of completed.reverse()) {
        try {
            if (write.previous) {
                await relationRepository.updateDashboardRelationProjection(write.previous);
            } else {
                await relationRepository.deleteDashboardRelationProjection(
                    dashboardRelationProjectionId(write.projection),
                );
            }
        } catch {
            // Best-effort rollback: keep restoring remaining projections.
        }
    }
}

export { DuplicateRelationError };
