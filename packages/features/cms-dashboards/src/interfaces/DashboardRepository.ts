import type { Dashboard } from "./Dashboard";

export interface DashboardRepository {
    createDashboard(dashboard: Dashboard): Promise<Dashboard>;
    updateDashboard(dashboard: Dashboard): Promise<Dashboard | null>;
    deleteDashboard(id: string): Promise<boolean>;
    getDashboard(id: string): Promise<Dashboard | null>;
    getAllDashboards(): Promise<Dashboard[]>;
}
