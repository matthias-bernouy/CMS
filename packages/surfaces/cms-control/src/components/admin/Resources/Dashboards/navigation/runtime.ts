import { getMetaBasePath } from "cms-control/core/dom/meta/getMetaBasePath";
import type { NavigationItem } from "../domain/types";
import "../../Blocs/icons/LibraryIcon";

function firstUse(item: NavigationItem): string | null {
    return item.use ?? item.children?.map(firstUse).find(Boolean) ?? null;
}

function findPath(items: NavigationItem[], use: string, parents: NavigationItem[] = []): NavigationItem[] {
    for (const item of items) {
        const path = [...parents, item];
        if (item.use === use) {
            return path;
        }
        const child = findPath(item.children ?? [], use, path);
        if (child.length) {
            return child;
        }
    }
    return [];
}

function viewUrl(dashboardId: string, use: string): string {
    return `${getMetaBasePath()}/admin/dashboards/view?dashboardId=${encodeURIComponent(dashboardId)}&viewId=${encodeURIComponent(use)}`;
}

function navItem(item: NavigationItem, dashboardId: string, active: boolean): HTMLElement {
    const element = document.createElement("w13c-lateral-menu-item");
    element.setAttribute("manual-active", "");
    element.toggleAttribute("active", active);
    const use = firstUse(item);
    if (use) {
        element.setAttribute("href", viewUrl(dashboardId, use));
    }
    const icon = document.createElement("cms-library-icon");
    icon.slot = "icon";
    icon.setAttribute("name", item.icon ?? "layout");
    element.append(icon, document.createTextNode(item.label));
    return element;
}

export function renderRuntimeNavigation(dashboardId: string, items: NavigationItem[], activeUse: string): void {
    const path = findPath(items, activeUse);
    const primary = document.querySelector("[data-primary-navigation]")!;
    primary.replaceChildren(...items.map((item) => navItem(item, dashboardId, item.id === path[0]?.id)));
    const root = path[0];
    const lateral = root?.childPlacement === "lateral" ? (root.children ?? []) : [];
    const secondary = document.querySelector<HTMLElement>("[data-secondary-navigation]")!;
    secondary.querySelectorAll("w13c-lateral-menu-item").forEach((node) => node.remove());
    secondary.append(...lateral.map((item) => navItem(item, dashboardId, item.id === path[1]?.id)));
    secondary.toggleAttribute("hidden", lateral.length === 0);
    const title = secondary.querySelector("[data-secondary-title]");
    if (title) {
        title.textContent = root?.label ?? "Sections";
    }
    document.querySelector("[data-secondary-mobile-label]")!.textContent = root?.label ?? "Sections";
    const tabOwner = root?.childPlacement === "tabs" ? root : path[1]?.childPlacement === "tabs" ? path[1] : null;
    const tabs = document.querySelector<HTMLElement>("[data-dashboard-tabs]")!;
    tabs.replaceChildren(
        ...(tabOwner?.children ?? []).map((item) => {
            const anchor = document.createElement("p9r-nav-tab");
            anchor.setAttribute("href", viewUrl(dashboardId, firstUse(item)!));
            const icon = document.createElement("cms-library-icon");
            icon.setAttribute("name", item.icon ?? "layout");
            anchor.append(icon, document.createTextNode(item.label));
            anchor.toggleAttribute(
                "active",
                path.some((part) => part.id === item.id),
            );
            return anchor;
        }),
    );
    tabs.toggleAttribute("hidden", !tabOwner?.children?.length);
}

export async function renderDashboardSwitcher(dashboardId: string): Promise<void> {
    const base = getMetaBasePath();
    let response = await fetch(`${base}/api/dashboards`, { cache: "no-store" });
    const isAdmin = response.ok;
    if (response.status === 403) {
        response = await fetch(`${base}/api/my-dashboards`, { cache: "no-store" });
    }
    document.querySelector<HTMLElement>("[data-admin-return]")?.toggleAttribute("hidden", !isAdmin);
    if (!response.ok) {
        return;
    }
    const data = (await response.json()) as {
        dashboards: { id: string; name: string; icon?: string; mounts: { collectionId: string; viewId: string }[] }[];
    };
    const available = data.dashboards.filter((item) => item.mounts.length);
    const current = available.find((item) => item.id === dashboardId) ?? available[0];
    if (!current) {
        return;
    }
    const wrapper = document.createElement("div");
    wrapper.className = "dashboard-switcher";
    const currentIcon = document.createElement("cms-library-icon");
    currentIcon.setAttribute("name", current.icon || "layout");
    const menu = document.createElement("p9r-action-menu");
    menu.setAttribute("label", current.name);
    menu.setAttribute("align", "start");
    menu.setAttribute("aria-label", `Switch dashboard, current dashboard: ${current.name}`);
    for (const dashboard of available) {
        const first = dashboard.mounts[0]!;
        const item = document.createElement("p9r-action-menu-item");
        item.setAttribute("href", viewUrl(dashboard.id, `${first.collectionId}:${first.viewId}`));
        item.setAttribute("data-dashboard-id", dashboard.id);
        if (dashboard.id === current.id) {
            item.setAttribute("aria-current", "page");
        }
        const icon = document.createElement("cms-library-icon");
        icon.slot = "icon";
        icon.setAttribute("name", dashboard.icon || "layout");
        item.append(icon, document.createTextNode(dashboard.name));
        menu.append(item);
    }
    wrapper.append(currentIcon, menu);
    document.querySelector("[data-dashboard-switcher]")?.replaceChildren(wrapper);
}
