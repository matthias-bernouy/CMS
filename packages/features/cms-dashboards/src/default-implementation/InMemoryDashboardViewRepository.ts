import { DuplicateDashboardViewError } from "../core/errors";
import type { DashboardViewDefinition } from "../interfaces/Dashboard";
import type { DashboardViewRepository } from "../interfaces/DashboardViewRepository";

export class InMemoryDashboardViewRepository implements DashboardViewRepository {
    private readonly views = new Map<string, DashboardViewDefinition>();

    async createView(view: DashboardViewDefinition): Promise<DashboardViewDefinition> {
        if (this.views.has(view.id)) {
            throw new DuplicateDashboardViewError(view.id);
        }
        this.views.set(view.id, structuredClone(view));
        return structuredClone(view);
    }

    async updateView(view: DashboardViewDefinition): Promise<DashboardViewDefinition | null> {
        if (!this.views.has(view.id)) {
            return null;
        }
        this.views.set(view.id, structuredClone(view));
        return structuredClone(view);
    }

    async deleteView(id: string): Promise<boolean> {
        return this.views.delete(id);
    }

    async getView(id: string): Promise<DashboardViewDefinition | null> {
        const view = this.views.get(id);
        return view ? structuredClone(view) : null;
    }

    async getViewsForSource(sourceId: string): Promise<DashboardViewDefinition[]> {
        return Array.from(this.views.values())
            .filter((view) => view.source === sourceId)
            .map((view) => structuredClone(view));
    }

    async getAllViews(): Promise<DashboardViewDefinition[]> {
        return Array.from(this.views.values(), (view) => structuredClone(view));
    }
}
