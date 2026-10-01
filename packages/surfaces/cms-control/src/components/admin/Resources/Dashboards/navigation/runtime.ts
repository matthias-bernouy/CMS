import { getMetaBasePath } from "cms-control/core/dom/meta/getMetaBasePath";
import type { NavigationItem } from "../domain/types";

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
    element.textContent = item.label;
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
            anchor.textContent = item.label;
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
    if (response.status === 403) {
        response = await fetch(`${base}/api/my-dashboards`, { cache: "no-store" });
    }
    if (!response.ok) {
        return;
    }
    const data = (await response.json()) as {
        dashboards: { id: string; name: string; mounts: { collectionId: string; viewId: string }[] }[];
    };
    const select = document.createElement("select");
    select.setAttribute("aria-label", "Switch dashboard");
    for (const dashboard of data.dashboards.filter((item) => item.mounts.length)) {
        const option = document.createElement("option");
        option.value = dashboard.id;
        option.textContent = dashboard.name;
        select.append(option);
    }
    select.value = dashboardId;
    select.addEventListener("change", () => {
        const chosen = data.dashboards.find((item) => item.id === select.value);
        const first = chosen?.mounts[0];
        if (first) {
            location.href = viewUrl(chosen!.id, `${first.collectionId}:${first.viewId}`);
        }
    });
    document.querySelector("[data-dashboard-switcher]")?.replaceChildren(select);
}
