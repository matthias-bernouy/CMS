import type { Dashboard } from "../interfaces/Dashboard";
import type { DashboardRepository } from "../interfaces/DashboardRepository";
import { DuplicateDashboardError } from "../core/errors";

/**
 * Dep-free dashboard repository for dev and tests. Stored dashboards are plain
 * JSON, so defensive `structuredClone` keeps callers from mutating repository
 * state through object references.
 */
export class InMemoryDashboardRepository implements DashboardRepository {
    private readonly dashboards = new Map<string, Dashboard>();

    async createDashboard(dashboard: Dashboard): Promise<Dashboard> {
        if (this.dashboards.has(dashboard.id)) {
            throw new DuplicateDashboardError(dashboard.id);
        }
        this.dashboards.set(dashboard.id, structuredClone(dashboard));
        return structuredClone(dashboard);
    }

    async updateDashboard(dashboard: Dashboard): Promise<Dashboard | null> {
        if (!this.dashboards.has(dashboard.id)) {
            return null;
        }
        this.dashboards.set(dashboard.id, structuredClone(dashboard));
        return structuredClone(dashboard);
    }

    async deleteDashboard(id: string): Promise<boolean> {
        return this.dashboards.delete(id);
    }

    async getDashboard(id: string): Promise<Dashboard | null> {
        const found = this.dashboards.get(id);
        return found ? structuredClone(found) : null;
    }

    async getDashboardsForSource(sourceId: string): Promise<Dashboard[]> {
        return Array.from(this.dashboards.values())
            .filter((dashboard) => dashboard.source === sourceId)
            .map((dashboard) => structuredClone(dashboard));
    }

    async getAllDashboards(): Promise<Dashboard[]> {
        return Array.from(this.dashboards.values(), (dashboard) => structuredClone(dashboard));
    }
}
