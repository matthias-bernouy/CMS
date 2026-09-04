import type { DashboardDefinition } from "./Dashboard";

export interface DashboardRepository {
    createDashboard(dashboard: DashboardDefinition): Promise<DashboardDefinition>;
    updateDashboard(dashboard: DashboardDefinition): Promise<DashboardDefinition | null>;
    deleteDashboard(id: string): Promise<boolean>;
    getDashboard(id: string): Promise<DashboardDefinition | null>;
    getAllDashboards(): Promise<DashboardDefinition[]>;
}
