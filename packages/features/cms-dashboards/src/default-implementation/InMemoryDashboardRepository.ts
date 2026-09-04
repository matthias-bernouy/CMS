import type { DashboardDefinition } from "../interfaces/Dashboard";
import type { DashboardRepository } from "../interfaces/DashboardRepository";
import { DuplicateDashboardError } from "../core/errors";

/**
 * Dep-free dashboard repository for dev and tests. Stored dashboards are plain
 * JSON, so defensive `structuredClone` keeps callers from mutating repository
 * state through object references.
 */
export class InMemoryDashboardRepository implements DashboardRepository {
    private readonly dashboards = new Map<string, DashboardDefinition>();

    async createDashboard(dashboard: DashboardDefinition): Promise<DashboardDefinition> {
        if (this.dashboards.has(dashboard.id)) {
            throw new DuplicateDashboardError(dashboard.id);
        }
        this.dashboards.set(dashboard.id, structuredClone(dashboard));
        return structuredClone(dashboard);
    }

    async updateDashboard(dashboard: DashboardDefinition): Promise<DashboardDefinition | null> {
        if (!this.dashboards.has(dashboard.id)) {
            return null;
        }
        this.dashboards.set(dashboard.id, structuredClone(dashboard));
        return structuredClone(dashboard);
    }

    async deleteDashboard(id: string): Promise<boolean> {
        return this.dashboards.delete(id);
    }

    async getDashboard(id: string): Promise<DashboardDefinition | null> {
        const found = this.dashboards.get(id);
        return found ? structuredClone(found) : null;
    }

    async getAllDashboards(): Promise<DashboardDefinition[]> {
        return Array.from(this.dashboards.values(), (dashboard) => structuredClone(dashboard));
    }
}
