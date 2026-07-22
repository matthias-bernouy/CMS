import type { DashboardSourceGroup } from "../types";
import { appendIconSlot } from "./icons";

export function renderDashboardNavigation(
    menu: HTMLElement,
    groups: DashboardSourceGroup[],
    selectedSource: string,
    selectedDashboard: string,
): void {
    clearGeneratedItems(menu);
    if (!groups.length) {
        const empty = document.createElement("span");
        empty.className = "empty";
        empty.dataset.generated = "true";
        empty.textContent = "No sources";
        menu.append(empty);
        return;
    }

    for (const group of groups) {
        const sourceItem = createItem(group.source.name, group.source.svg, group.source.icon, "database");
        sourceItem.dataset.generated = "true";
        sourceItem.dataset.source = group.source.id;
        sourceItem.toggleAttribute("active", group.source.id === selectedSource);
        menu.append(sourceItem);

        if (group.source.id === selectedSource && group.dashboards.length > 1) {
            appendDashboardItems(menu, group, selectedDashboard);
        }
    }
}

export function renderDashboardNavigationExample(menu: HTMLElement): void {
    clearGeneratedItems(menu);
    const sourceItem = createItem("Example source", undefined, "database", "database");
    sourceItem.dataset.generated = "true";
    sourceItem.toggleAttribute("active", true);
    menu.append(sourceItem);

    const dashboardItem = createItem("Product dashboard", undefined, "layout", "layout");
    dashboardItem.classList.add("dashboard-item");
    dashboardItem.dataset.generated = "true";
    dashboardItem.toggleAttribute("active", true);
    menu.append(dashboardItem);
}

function appendDashboardItems(menu: HTMLElement, group: DashboardSourceGroup, selectedDashboard: string): void {
    for (const dashboard of group.dashboards) {
        const item = createItem(
            dashboard.meta?.name ?? dashboard.id,
            dashboard.meta?.svg,
            dashboard.meta?.icon,
            "layout",
        );
        item.classList.add("dashboard-item");
        item.dataset.generated = "true";
        item.dataset.source = group.source.id;
        item.dataset.dashboard = dashboard.id;
        item.toggleAttribute("active", dashboard.id === selectedDashboard);
        menu.append(item);
    }
}

function createItem(
    label: string,
    svg: string | undefined,
    icon: string | undefined,
    fallback: "database" | "layout",
): HTMLElement {
    const item = document.createElement("w13c-lateral-menu-item");
    appendIconSlot(item, svg, icon, fallback);
    item.append(document.createTextNode(label));
    return item;
}

function clearGeneratedItems(menu: HTMLElement): void {
    menu.querySelectorAll("[data-generated]").forEach((element) => element.remove());
}
