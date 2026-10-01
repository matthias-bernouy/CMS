import { getMetaBasePath } from "cms-control/core/dom/meta/getMetaBasePath";
import type { Dashboard, ExploreDashboard } from "../domain/types";
import "../../Blocs/icons/CertifiedBadge";

export function renderMemberDashboardList(root: HTMLElement, dashboards: Dashboard[]): void {
    const list = root.querySelector("[data-list]")!;
    const available = dashboards.filter((item) => item.mounts.length > 0);
    list.replaceChildren(
        ...available.map((item) => {
            const card = document.createElement("p9r-card");
            card.setAttribute("stretch", "");
            const link = document.createElement("a");
            link.slot = "actions";
            const first = item.mounts[0]!;
            link.href = `${getMetaBasePath()}/admin/dashboards/view?dashboardId=${encodeURIComponent(item.id)}&viewId=${encodeURIComponent(`${first.collectionId}:${first.viewId}`)}`;
            link.textContent = "Open dashboard";
            const title = dashboardTitle(item.name, item.icon ?? "layout", `${item.mounts.length} views`);
            const detail = document.createElement("p");
            detail.textContent = item.description ?? "Open this assigned dashboard.";
            card.append(title, detail, link);
            return card;
        }),
    );
    root.querySelector("[data-empty]")!.toggleAttribute("hidden", available.length > 0);
    root.querySelector("[data-empty-title]")!.textContent = "No dashboards assigned";
    root.querySelector("[data-empty-hint]")!.textContent = "Ask an administrator to assign you to an active dashboard.";
}

export function renderCollectionMounts(root: HTMLElement, dashboard: Dashboard): void {
    root.querySelector("[data-collection-views]")!.replaceChildren(
        ...dashboard.mounts.map((mount) => {
            const item = document.createElement("li");
            const link = document.createElement("a");
            link.href = `${getMetaBasePath()}/admin/dashboards/view?dashboardId=${encodeURIComponent(dashboard.id)}&viewId=${encodeURIComponent(`${mount.collectionId}:${mount.viewId}`)}`;
            link.textContent = mount.label;
            item.append(link);
            return item;
        }),
    );
}

export function exploreDashboardCard(item: ExploreDashboard, index: number): HTMLElement {
    const card = document.createElement("p9r-card");
    card.setAttribute("stretch", "");
    const title = dashboardTitle(
        item.name,
        item.icon,
        item.publisherId === "ulvia.official" ? "Ulvia" : item.collectionName,
        item.publisherId === "ulvia.official",
    );
    const description = document.createElement("p");
    description.textContent = item.description;
    const meta = document.createElement("span");
    meta.slot = "meta";
    meta.textContent = `${item.viewCount} ${item.viewCount === 1 ? "view" : "views"}`;
    const action = document.createElement("p9r-button");
    action.slot = "actions";
    action.dataset.exploreKey = String(index);
    action.setAttribute("type", "button");
    action.setAttribute("variant", item.installed ? "outlined" : "filled");
    if (!item.installed) {
        action.setAttribute("color", "primary");
    }
    action.textContent = item.installed ? "Manage" : item.installedVersion ? "Update collection" : "Install collection";
    card.append(title, description, meta, action);
    return card;
}

function dashboardTitle(name: string, iconName: string | undefined, detail: string, official = false): HTMLElement {
    const title = document.createElement("div");
    title.slot = "title";
    title.className = "dashboard-card-title";
    const icon = document.createElement("span");
    icon.className = "dashboard-card-icon";
    const glyph = document.createElement("cms-library-icon");
    glyph.setAttribute("name", iconName || "layout");
    icon.append(glyph);
    const copy = document.createElement("span");
    const heading = document.createElement("strong");
    heading.textContent = name;
    const secondary = document.createElement("small");
    secondary.textContent = detail;
    if (official) {
        const publisher = document.createElement("span");
        publisher.className = "dashboard-card-publisher";
        const badge = document.createElement("cms-certified-badge");
        badge.setAttribute("label", "Certified official Ulvia dashboard");
        publisher.append(secondary, badge);
        copy.append(heading, publisher);
    } else {
        copy.append(heading, secondary);
    }
    title.append(icon, copy);
    return title;
}
