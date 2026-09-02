import type { IntegrationArtifactResult, IntegrationImportDeps } from "../../../interfaces/IntegrationImport";
import { IntegrationRuntimeError } from "../../errors";

export type ArtifactRestorer = () => Promise<void>;

export async function deleteArtifact(
    deps: IntegrationImportDeps,
    artifact: IntegrationArtifactResult,
): Promise<ArtifactRestorer | null> {
    const id = artifact.id;
    switch (artifact.type) {
        case "source":
            return deleteAndRestore(
                () => deps.sources.getSource(id),
                () => deps.sources.deleteSource(id),
                (previous) => deps.sources.createSource(previous),
            );
        case "function": {
            const repository = deps.functions ?? missingRepository("function");
            return deleteAndRestore(
                () => repository.getFunction(id),
                () => repository.deleteFunction(id),
                (previous) => repository.createFunction(previous),
            );
        }
        case "trigger": {
            const repository = deps.triggers ?? missingRepository("trigger");
            return deleteAndRestore(
                () => repository.getTrigger(id),
                () => repository.deleteTrigger(id),
                (previous) => repository.createTrigger(previous),
            );
        }
        case "dashboard": {
            const repository = deps.dashboards ?? missingRepository("dashboard");
            const previous = await repository.getDashboard(id);
            if (!previous) {
                return null;
            }
            const subjectIds = (await deps.dashboardAssignments?.getSubjectIdsForDashboard(id)) ?? [];
            if (!(await repository.deleteDashboard(id))) {
                return null;
            }
            try {
                await deps.dashboardAssignments?.deleteForDashboard(id);
            } catch (error) {
                await repository.createDashboard(previous);
                throw error;
            }
            return async () => {
                if (!(await repository.getDashboard(id))) {
                    await repository.createDashboard(previous);
                }
                for (const subjectId of subjectIds) {
                    await deps.dashboardAssignments?.assign({ subjectId, dashboardId: id });
                }
            };
        }
        case "dashboard-view": {
            const repository = deps.dashboardViews ?? missingRepository("dashboard view");
            return deleteAndRestore(
                () => repository.getView(id),
                () => repository.deleteView(id),
                (previous) => repository.createView(previous),
            );
        }
        case "sourceOverlay": {
            const repository = deps.sourceOverlays ?? missingRepository("source overlay");
            return deleteAndRestore(
                () => repository.getOverlay(id),
                () => repository.deleteOverlay(id),
                (previous) => repository.upsertOverlay(previous),
            );
        }
        case "relation": {
            const repository = deps.relations ?? missingRepository("relation");
            return deleteAndRestore(
                () => repository.getRelation(id),
                () => repository.deleteRelation(id),
                (previous) => repository.createRelation(previous),
            );
        }
        case "dashboardRelation": {
            const repository = deps.relations ?? missingRepository("relation");
            return deleteAndRestore(
                () => repository.getDashboardRelationProjection(id),
                () => repository.deleteDashboardRelationProjection(id),
                (previous) => repository.createDashboardRelationProjection(previous),
            );
        }
        case "bloc":
            throw new IntegrationRuntimeError(
                `cannot remove obsolete bloc artifact "${id}": bloc deletion is not supported`,
            );
    }
}

export async function restoreArtifacts(restorers: readonly ArtifactRestorer[]): Promise<void> {
    for (const restore of [...restorers].reverse()) {
        try {
            await restore();
        } catch {
            // Best-effort rollback: keep restoring remaining artifacts.
        }
    }
}

async function deleteAndRestore<T>(
    get: () => Promise<T | null>,
    remove: () => Promise<boolean>,
    create: (previous: T) => Promise<unknown>,
): Promise<ArtifactRestorer | null> {
    const previous = await get();
    if (!previous || !(await remove())) {
        return null;
    }
    return async () => {
        if (!(await get())) {
            await create(previous);
        }
    };
}

function missingRepository(kind: string): never {
    throw new IntegrationRuntimeError(`${kind} repository not configured`);
}
