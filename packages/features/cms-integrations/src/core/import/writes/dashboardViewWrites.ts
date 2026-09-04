import type { DashboardViewDefinition, DashboardViewRepository } from "@bernouy/cms-dashboards";
import { IntegrationRuntimeError } from "../../errors";
import type { IntegrationArtifactResult } from "../../../interfaces/IntegrationImport";

export type IntegrationDashboardViewWrite = {
    view: DashboardViewDefinition;
    previous: DashboardViewDefinition | null;
};

export async function writeDashboardViewsWithRollback<T>(
    repository: DashboardViewRepository,
    writes: IntegrationDashboardViewWrite[],
    operation: (artifacts: IntegrationArtifactResult[]) => Promise<T>,
): Promise<T> {
    const completed: IntegrationDashboardViewWrite[] = [];
    const artifacts: IntegrationArtifactResult[] = [];
    try {
        for (const write of writes) {
            if (write.previous) {
                if (!(await repository.updateView(write.view))) {
                    throw new IntegrationRuntimeError(
                        `dashboard view disappeared during import: ${write.view.id}`,
                        409,
                    );
                }
                artifacts.push({ type: "dashboard-view", id: write.view.id, action: "updated" });
            } else {
                await repository.createView(write.view);
                artifacts.push({ type: "dashboard-view", id: write.view.id, action: "created" });
            }
            completed.push(write);
        }
        return await operation(artifacts);
    } catch (error) {
        await rollback(repository, completed);
        throw error;
    }
}

async function rollback(
    repository: DashboardViewRepository,
    completed: IntegrationDashboardViewWrite[],
): Promise<void> {
    for (const write of completed.reverse()) {
        try {
            if (write.previous) {
                await repository.updateView(write.previous);
            } else {
                await repository.deleteView(write.view.id);
            }
        } catch {
            // Best-effort rollback: keep restoring remaining views.
        }
    }
}
