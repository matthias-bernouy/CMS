import type { Dashboard, DashboardRepository } from "@bernouy/cms-dashboards";
import { DuplicateDashboardError } from "@bernouy/cms-dashboards";
import { IntegrationRuntimeError } from "../../errors";
import type { IntegrationArtifactResult } from "../../../interfaces/IntegrationImport";

export type IntegrationDashboardWrite = {
    dashboard: Dashboard;
    previous: Dashboard | null;
};

export function writeDashboardsWithRollback(
    dashboardRepository: DashboardRepository,
    writes: IntegrationDashboardWrite[],
): Promise<IntegrationArtifactResult[]>;
export function writeDashboardsWithRollback<T>(
    dashboardRepository: DashboardRepository,
    writes: IntegrationDashboardWrite[],
    operation: (artifacts: IntegrationArtifactResult[]) => Promise<T>,
): Promise<T>;
export async function writeDashboardsWithRollback<T>(
    dashboardRepository: DashboardRepository,
    writes: IntegrationDashboardWrite[],
    operation?: (artifacts: IntegrationArtifactResult[]) => Promise<T>,
): Promise<T> {
    const completed: IntegrationDashboardWrite[] = [];
    const artifacts: IntegrationArtifactResult[] = [];

    try {
        for (const write of writes) {
            if (write.previous) {
                const updated = await dashboardRepository.updateDashboard(write.dashboard);
                if (!updated) {
                    throw new IntegrationRuntimeError(
                        `dashboard disappeared during import: ${write.dashboard.id}`,
                        409,
                    );
                }
                completed.push(write);
                artifacts.push({ type: "dashboard", id: write.dashboard.id, action: "updated" });
            } else {
                await dashboardRepository.createDashboard(write.dashboard);
                completed.push(write);
                artifacts.push({ type: "dashboard", id: write.dashboard.id, action: "created" });
            }
        }
        return operation ? await operation(artifacts) : (artifacts as T);
    } catch (error) {
        await rollbackDashboards(dashboardRepository, completed);
        throw error;
    }
}

async function rollbackDashboards(
    dashboardRepository: DashboardRepository,
    completed: IntegrationDashboardWrite[],
): Promise<void> {
    for (const write of completed.reverse()) {
        try {
            if (write.previous) {
                await dashboardRepository.updateDashboard(write.previous);
            } else {
                await dashboardRepository.deleteDashboard(write.dashboard.id);
            }
        } catch {
            // Best-effort rollback: keep restoring remaining dashboards.
        }
    }
}

export { DuplicateDashboardError };
