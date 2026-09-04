import type { DashboardDefinition, ResolvedDashboard, ResolvedDashboardView } from "@bernouy/cms-dashboards";
import { appendIconSlot } from "../../Resources/Dashboards/navigation/icons";

export type OperatorNavigationSurface = "switcher" | "primary" | "secondary" | "profile";

export type OperatorSubject = { id: string; role: string; email?: string };

type ValueControl = HTMLElement & { value: string };

export function renderDashboardSwitcher(root: ShadowRoot, dashboards: DashboardDefinition[], selectedId: string): void {
    const container = switcherContainer(root);
    const current = dashboards.find((dashboard) => dashboard.id === selectedId) ?? dashboards[0];
    const select = document.createElement("p9r-select") as ValueControl;
    select.dataset.dashboardSwitcher = "true";
    select.setAttribute("aria-label", "Select dashboard");
    for (const dashboard of dashboards) {
        const option = document.createElement("option");
        option.value = dashboard.id;
        option.textContent = dashboard.meta.name;
        select.append(option);
    }
    select.setAttribute("value", current?.id ?? "");
    select.value = current?.id ?? "";
    select.toggleAttribute("disabled", dashboards.length < 2);
    container.replaceChildren(select);
}

export function renderOperatorLevel(
    root: ShadowRoot,
    dashboard: ResolvedDashboard | null,
    path: string,
    level: 1 | 2,
): void {
    const menu = operatorMenu(root, level === 1 ? "primary" : "secondary");
    const segments = path.split("/").filter(Boolean);
    const parent = level === 2 ? dashboard?.views.find((view) => view.id === segments[0]) : undefined;
    const entries = level === 1 ? (dashboard?.views ?? []) : (parent?.children ?? []);
    (root.host as HTMLElement).toggleAttribute("hidden", level === 2 && entries.length === 0);
    const heading = menu.querySelector<HTMLElement>("[data-level-heading]")!;
    heading.textContent = "";
    heading.hidden = true;
    for (const entry of entries) {
        menu.append(levelItem(entry, segments, level, dashboard?.id ?? ""));
    }
}

export function renderOperatorProfile(
    root: ShadowRoot,
    subject: OperatorSubject | null,
    dashboardId: string,
    path: string,
): void {
    root.querySelector<HTMLElement>("[data-dashboard-switcher-container]")!.hidden = true;
    root.querySelector<HTMLElement>("[data-operator-navigation]")!.hidden = true;
    const container = root.querySelector<HTMLElement>("[data-dashboard-profile-container]")!;
    container.hidden = !subject;
    container.replaceChildren();
    if (!subject) {
        return;
    }
    const item = document.createElement("w13c-lateral-menu-item");
    item.dataset.operatorProfileLink = "true";
    item.textContent = "Profile";
    item.setAttribute("href", profileHref(dashboardId, path));
    item.setAttribute("exact", "");
    item.toggleAttribute("active", isProfilePage());
    appendIconSlot(item, undefined, "user", "user");
    container.append(item);
}

function operatorMenu(root: ShadowRoot, surface: Exclude<OperatorNavigationSurface, "switcher">): HTMLElement {
    root.querySelector<HTMLElement>("[data-dashboard-switcher-container]")!.hidden = true;
    root.querySelector<HTMLElement>("[data-dashboard-profile-container]")!.hidden = true;
    const menu = root.querySelector<HTMLElement>("[data-operator-navigation]")!;
    menu.hidden = false;
    menu.dataset.surface = surface;
    menu.querySelectorAll("[data-operator-generated]").forEach((node) => node.remove());
    return menu;
}

function switcherContainer(root: ShadowRoot): HTMLElement {
    root.querySelector<HTMLElement>("[data-operator-navigation]")!.hidden = true;
    root.querySelector<HTMLElement>("[data-dashboard-profile-container]")!.hidden = true;
    const container = root.querySelector<HTMLElement>("[data-dashboard-switcher-container]")!;
    container.hidden = false;
    return container;
}

function levelItem(entry: ResolvedDashboardView, segments: string[], level: 1 | 2, dashboardId: string): HTMLElement {
    const item = document.createElement("w13c-lateral-menu-item");
    item.dataset.operatorGenerated = "true";
    const prefix = level === 1 ? [] : [segments[0]!];
    const path = [...prefix, entry.id].join("/");
    item.dataset.viewPath = path;
    if (isProfilePage()) {
        item.setAttribute("href", dashboardHref(dashboardId, path));
        item.setAttribute("exact", "");
    }
    item.toggleAttribute("active", entry.id === segments[level - 1]);
    item.textContent = entry.label;
    appendIconSlot(item, undefined, entry.icon, "layout");
    return item;
}

function dashboardHref(dashboardId: string, path: string): string {
    return controlHref("/dashboards", dashboardId, path);
}

function profileHref(dashboardId: string, path: string): string {
    return controlHref("/dashboards/profile", dashboardId, path);
}

function controlHref(route: string, dashboardId: string, path: string): string {
    const basePath =
        document.querySelector('meta[name="basePath"]')?.getAttribute("content")?.replace(/\/+$/, "") ?? "";
    const params = new URLSearchParams();
    if (dashboardId) {
        params.set("id", dashboardId);
    }
    if (path) {
        params.set("view", path);
    }
    const query = params.toString();
    return `${basePath}${route}${query ? `?${query}` : ""}`;
}

function isProfilePage(): boolean {
    const basePath =
        document.querySelector('meta[name="basePath"]')?.getAttribute("content")?.replace(/\/+$/, "") ?? "";
    return window.location.pathname === `${basePath}/dashboards/profile`;
}
