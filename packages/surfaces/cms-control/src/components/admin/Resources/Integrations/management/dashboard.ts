import { fetchDashboards } from "../../Dashboards/api";
import type { DashboardView } from "../../Dashboards/view/DashboardView";
import "../../Dashboards/view/DashboardView";

export async function settingsDashboard(id: string): Promise<HTMLElement> {
    const groups = await fetchDashboards();
    const group = groups.find((group) => group.dashboards.some((dashboard) => dashboard.id === id));
    if (!group) {
        throw new Error("The settings dashboard is unavailable.");
    }
    const view = document.createElement("cms-dashboards-admin") as DashboardView;
    view.setAttribute("external", "");
    view.setAttribute("embedded", "");
    // The existing dashboard owns its local selection and reloads without changing the Sources route.
    queueMicrotask(() => view.setExternalContext(groups, { source: group.source.id, dashboard: id }));
    return view;
}
