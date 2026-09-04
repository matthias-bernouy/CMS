import type { DashboardDefinition, DashboardViewDefinition, DashboardViewMount } from "@bernouy/cms-dashboards";
import { renderIcon } from "../../../Resources/Dashboards/navigation/icons";

export function readonlyNavigation(dashboard: DashboardDefinition, views: DashboardViewDefinition[]): HTMLElement {
    const section = document.createElement("cms-detail-section");
    section.setAttribute("heading", "Navigation");
    section.append(readonlyList(dashboard.views, views));
    return section;
}

function readonlyList(mounts: DashboardViewMount[], views: DashboardViewDefinition[]): HTMLOListElement {
    const list = document.createElement("ol");
    list.className = "readonly-navigation";
    for (const mount of mounts) {
        const view = views.find((candidate) => candidate.id === mount.use);
        const item = document.createElement("li");
        const row = document.createElement("div");
        const icon = document.createElement("span");
        icon.className = "readonly-navigation-icon";
        renderIcon(icon, undefined, mount.icon ?? view?.meta.icon ?? view?.view.icon, "layout");
        const label = document.createElement("span");
        label.textContent = mount.label ?? view?.meta.name ?? view?.view.label ?? mount.id;
        row.append(icon, label);
        item.append(row);
        if (mount.children?.length) {
            item.append(readonlyList(mount.children, views));
        }
        list.append(item);
    }
    return list;
}
