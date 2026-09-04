import type { DashboardDefinition, ResolvedDashboard } from "@bernouy/cms-dashboards";

export const DASHBOARD_SELECTED_EVENT = "cms-dashboard-workspace:selected";
export const DASHBOARD_NAVIGATION_EVENT = "cms-dashboard-workspace:navigation";
export const DASHBOARD_VIEW_SELECTED_EVENT = "cms-dashboard-workspace:view-selected";

export type DashboardNavigationState = {
    dashboards: DashboardDefinition[];
    dashboard: ResolvedDashboard | null;
    path: string;
    subject: { id: string; role: string; email?: string } | null;
    logoutUrl: string;
};

export function dispatchDashboardSelected(id: string): void {
    window.dispatchEvent(new CustomEvent(DASHBOARD_SELECTED_EVENT, { detail: { id } }));
}

export function dispatchDashboardNavigation(state: DashboardNavigationState): void {
    window.dispatchEvent(new CustomEvent(DASHBOARD_NAVIGATION_EVENT, { detail: state }));
}

export function dispatchDashboardViewSelected(path: string): void {
    window.dispatchEvent(new CustomEvent(DASHBOARD_VIEW_SELECTED_EVENT, { detail: { path } }));
}
