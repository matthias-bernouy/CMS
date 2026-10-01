import { Component } from "@bernouy/components/base";
import { getMetaBasePath } from "cms-control/core/dom/meta/getMetaBasePath";
import type { Dashboard } from "../domain/types";
import "../../Blocs/icons/LibraryIcon";
import css from "./style.css" with { type: "text" };
import template from "./template.html" with { type: "text" };

export class DashboardNav extends Component {
    constructor() {
        super({ css: css as unknown as string, template: template as unknown as string });
    }

    override connectedCallback(): void {
        super.connectedCallback();
        this.shadowRoot!.querySelector("[data-overview]")!.setAttribute(
            "href",
            `${getMetaBasePath()}/admin/dashboards`,
        );
    }

    render(dashboards: Dashboard[], selectedId: string, memberMode: boolean): void {
        const root = this.shadowRoot!;
        root.querySelector("[data-overview]")!.toggleAttribute(
            "active",
            !selectedId && !location.search.includes("create=1"),
        );
        root.querySelectorAll("[data-dashboard-item], [data-dashboard-collection]").forEach((item) => item.remove());
        const siteAnchor = root.querySelector("[data-site-anchor]")!;
        for (const dashboard of dashboards.filter((item) => !item.origin)) {
            const item = dashboardItem(dashboard, selectedId, memberMode);
            item.dataset.dashboardItem = "";
            item.dataset.management = "";
            siteAnchor.before(item);
        }
        const groups = new Map<string, Dashboard[]>();
        for (const dashboard of dashboards.filter((item) => item.origin?.kind === "collection")) {
            const key = dashboard.origin!.collectionId;
            groups.set(key, [...(groups.get(key) ?? []), dashboard]);
        }
        const collectionAnchor = root.querySelector("[data-collection-anchor]")!;
        for (const [id, items] of [...groups.entries()].sort(([a], [b]) => a.localeCompare(b))) {
            const section = document.createElement("w13c-lateral-menu-section");
            section.dataset.dashboardCollection = "";
            section.dataset.management = "";
            section.setAttribute("label", items[0]?.collectionName ?? id);
            section.setAttribute("count", String(items.length));
            if (items.some((item) => item.id === selectedId) || groups.size === 1) {
                section.setAttribute("open", "");
            }
            section.append(...items.map((item) => dashboardItem(item, selectedId, memberMode)));
            collectionAnchor.before(section);
        }
    }
}

function dashboardItem(dashboard: Dashboard, selectedId: string, memberMode: boolean): HTMLElement {
    const item = document.createElement("w13c-lateral-menu-item");
    item.setAttribute("manual-active", "");
    item.toggleAttribute("active", dashboard.id === selectedId);
    if (!memberMode) {
        item.setAttribute("badge", dashboard.enabled ? "On" : "Off");
    }
    item.setAttribute(
        "href",
        memberMode && dashboard.mounts[0]
            ? viewUrl(dashboard.id, `${dashboard.mounts[0].collectionId}:${dashboard.mounts[0].viewId}`)
            : `${getMetaBasePath()}/admin/dashboards?dashboardId=${encodeURIComponent(dashboard.id)}`,
    );
    const icon = document.createElement("cms-library-icon");
    icon.slot = "icon";
    icon.setAttribute("name", dashboard.icon ?? "layout");
    item.append(icon, document.createTextNode(dashboard.name));
    return item;
}

function viewUrl(dashboardId: string, viewId: string): string {
    return `${getMetaBasePath()}/admin/dashboards/view?dashboardId=${encodeURIComponent(dashboardId)}&viewId=${encodeURIComponent(viewId)}`;
}

customElements.define("cms-dashboard-nav", DashboardNav);
