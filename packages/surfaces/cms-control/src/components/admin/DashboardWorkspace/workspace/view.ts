import type { DashboardDefinition, ResolvedDashboard, ResolvedDashboardView } from "@bernouy/cms-dashboards";
import type { DashboardSourceGroup } from "../../Resources/Dashboards/types";
import type { DashboardViewController } from "../../Resources/Dashboards/view/controller/DashboardViewController";
import { renderIcon } from "../../Resources/Dashboards/navigation/icons";

export function renderViewNavigation(root: ShadowRoot, dashboard: ResolvedDashboard, requested: string): string {
    const container = root.querySelector<HTMLElement>("[data-view-navigation]")!;
    container.replaceChildren();
    const path = resolveViewPath(dashboard, requested);
    const segments = path.split("/").filter(Boolean);
    if (segments.length < 3) {
        return path;
    }
    const first = dashboard.views.find((view) => view.id === segments[0]);
    const second = first?.children.find((view) => view.id === segments[1]);
    if (!first || !second?.children.length) {
        return path;
    }
    const row = document.createElement("div");
    row.className = "tab-row";
    row.setAttribute("role", "tablist");
    for (const view of second.children) {
        const button = document.createElement("button");
        button.type = "button";
        button.dataset.viewPath = `${first.id}/${second.id}/${view.id}`;
        button.setAttribute("role", "tab");
        button.setAttribute("aria-selected", String(view.id === segments[2]));
        const icon = document.createElement("span");
        icon.className = "tab-icon";
        renderIcon(icon, undefined, view.icon, "layout");
        const label = document.createElement("span");
        label.textContent = view.label;
        button.append(icon, label);
        row.append(button);
    }
    container.append(row);
    return path;
}

export function resolveViewPath(dashboard: ResolvedDashboard, requested: string): string {
    return (
        validLeafPath(dashboard, requested) ??
        validLeafPath(dashboard, dashboard.homeView) ??
        firstLeafPath(dashboard.views)
    );
}

export function mountDashboardRuntime(
    root: ShadowRoot,
    dashboardId: string,
    dashboard: ResolvedDashboard,
    groups: DashboardSourceGroup[],
    path: string,
): void {
    const view = viewAtPath(dashboard.views, path);
    const runtime = root.querySelector<DashboardViewController & HTMLElement>("[data-runtime]")!;
    if (!view?.source) {
        runtime.hidden = true;
        return;
    }
    const runtimeId = `view-${path.replaceAll("/", "-")}`;
    const runtimeGroups: DashboardSourceGroup[] = groups.map((group) => ({
        ...structuredClone(group),
        dashboards: [],
    }));
    const group = runtimeGroups.find((candidate) => candidate.source.id === view.source);
    if (!group) {
        runtime.hidden = true;
        return;
    }
    group.dashboards = [
        {
            id: runtimeId,
            source: view.source,
            meta: { name: view.label, ...(view.icon ? { icon: view.icon } : {}) },
            views: view.widgets,
        },
    ];
    document.documentElement.dataset.dashboardScope = dashboardId;
    runtime.hidden = false;
    runtime.setExternalContext(runtimeGroups, { source: view.source, dashboard: runtimeId });
}

export function renderHeader(root: ShadowRoot, dashboard: DashboardDefinition): void {
    root.querySelector<HTMLElement>("[data-name]")!.textContent = dashboard.meta.name;
    renderIcon(
        root.querySelector<HTMLElement>("[data-dashboard-icon]")!,
        dashboard.meta.svg,
        dashboard.meta.icon,
        "layout",
    );
    root.querySelector<HTMLElement>("[data-owner]")!.textContent =
        dashboard.origin.kind === "site" ? "Site dashboard" : dashboard.origin.integrationId;
}

export function selectedViewIds(dashboard: DashboardDefinition): Set<string> {
    const ids = new Set<string>();
    const visit = (mounts: DashboardDefinition["views"]): void => {
        for (const mount of mounts) {
            if (mount.use) {
                ids.add(mount.use);
            }
            visit(mount.children ?? []);
        }
    };
    visit(dashboard.views);
    return ids;
}

function validLeafPath(dashboard: ResolvedDashboard, path: string): string | null {
    const view = viewAtPath(dashboard.views, path);
    return view?.source ? path : view ? firstLeafPath(view.children, path) : null;
}

function firstLeafPath(views: ResolvedDashboardView[], parent = ""): string {
    const view = views[0];
    if (!view) {
        return parent;
    }
    const path = parent ? `${parent}/${view.id}` : view.id;
    return view.source || !view.children.length ? path : firstLeafPath(view.children, path);
}

export function viewAtPath(views: ResolvedDashboardView[], path: string): ResolvedDashboardView | null {
    let siblings = views;
    let selected: ResolvedDashboardView | undefined;
    for (const segment of path.split("/").filter(Boolean)) {
        selected = siblings.find((view) => view.id === segment);
        if (!selected) {
            return null;
        }
        siblings = selected.children;
    }
    return selected ?? null;
}
