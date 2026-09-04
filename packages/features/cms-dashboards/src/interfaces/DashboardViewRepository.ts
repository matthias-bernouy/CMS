import type { DashboardViewDefinition } from "./Dashboard";

export interface DashboardViewRepository {
    createView(view: DashboardViewDefinition): Promise<DashboardViewDefinition>;
    updateView(view: DashboardViewDefinition): Promise<DashboardViewDefinition | null>;
    deleteView(id: string): Promise<boolean>;
    getView(id: string): Promise<DashboardViewDefinition | null>;
    getViewsForSource(sourceId: string): Promise<DashboardViewDefinition[]>;
    getAllViews(): Promise<DashboardViewDefinition[]>;
}
