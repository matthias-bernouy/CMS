import { Component } from "@bernouy/components/base";
import {
    currentSelection,
    DASHBOARD_SELECTION_EVENT,
    defaultDashboardSource,
    dispatchDashboardSelection,
    route,
    replaceSelectionUrl,
    type DashboardSelection,
} from "./api";
import { appendIconSlot } from "./icons";
import { configureDashboardBindingFilters } from "./runtime/bindingFilters";
import css from "./nav.css" with { type: "text" };
import template from "./nav.html" with { type: "text" };
import type { DashboardSourceGroup } from "./types";

export class DashboardNav extends Component {
    private groups: DashboardSourceGroup[] = [];
    private selectedSource = "";
    private selectedDashboard = "";
    private observer: MutationObserver | null = null;

    constructor() {
        super({ css: css as unknown as string, template: template as unknown as string });
        configureDashboardBindingFilters();
    }

    override connectedCallback(): void {
        super.connectedCallback();
        this.syncFromUrl();
        this.shadowRoot!.addEventListener("click", this.onClick);
        window.addEventListener("popstate", this.onPopState);
        window.addEventListener(DASHBOARD_SELECTION_EVENT, this.onExternalSelection as EventListener);
        this.startBoundSource();
    }

    disconnectedCallback(): void {
        this.shadowRoot?.removeEventListener("click", this.onClick);
        window.removeEventListener("popstate", this.onPopState);
        window.removeEventListener(DASHBOARD_SELECTION_EVENT, this.onExternalSelection as EventListener);
        this.observer?.disconnect();
        this.observer = null;
    }

    private startBoundSource(): void {
        if (this.isExampleMode()) {
            this.renderExample();
            return;
        }
        const source = this.query<HTMLElement>("[data-nav-list-source]");
        source.setAttribute("cms-source", `${route("/api/dashboards")} as dashboards`);
        this.observer = new MutationObserver(() => this.readBoundGroups());
        this.observer.observe(source, { attributes: true, childList: true, subtree: true });
        this.readBoundGroups();
    }

    private readBoundGroups(): void {
        const target = this.shadowRoot!.querySelector<HTMLElement>("[data-nav-groups-json]");
        const next = parseGroups(target?.dataset.navGroupsJson ?? "");
        if (!next) return;
        this.groups = next;
        this.selectedSource ||= defaultDashboardSource(this.groups);
        this.ensureDashboardSelection();
        this.render();
    }

    private select(sourceId: string, dashboardId = ""): void {
        this.selectedSource = sourceId;
        this.selectedDashboard = dashboardId;
        this.ensureDashboardSelection();
        const selection = this.selection();
        replaceSelectionUrl(selection);
        dispatchDashboardSelection(selection);
        this.render();
    }

    private ensureDashboardSelection(): void {
        const group = this.activeGroup();
        if (!group) {
            this.selectedDashboard = "";
            return;
        }
        if (!group.dashboards.some(dashboard => dashboard.id === this.selectedDashboard)) {
            this.selectedDashboard = group.dashboards[0]?.id ?? "";
        }
    }

    private render(): void {
        const menu = this.query<HTMLElement>("w13c-lateral-menu");
        menu.querySelectorAll("[data-generated]").forEach(element => element.remove());

        if (!this.groups.length) {
            const empty = document.createElement("span");
            empty.className = "empty";
            empty.dataset.generated = "true";
            empty.textContent = "No sources";
            menu.append(empty);
            return;
        }

        for (const group of this.groups) {
            const sourceItem = this.createItem(group.source.name, group.source.svg, group.source.icon, "database");
            sourceItem.dataset.generated = "true";
            sourceItem.dataset.source = group.source.id;
            sourceItem.toggleAttribute("active", group.source.id === this.selectedSource);
            menu.append(sourceItem);

            if (group.source.id === this.selectedSource && group.dashboards.length > 1) {
                for (const dashboard of group.dashboards) {
                    const dashboardItem = this.createItem(dashboard.meta?.name ?? dashboard.id, dashboard.meta?.svg, dashboard.meta?.icon, "layout");
                    dashboardItem.classList.add("dashboard-item");
                    dashboardItem.dataset.generated = "true";
                    dashboardItem.dataset.source = group.source.id;
                    dashboardItem.dataset.dashboard = dashboard.id;
                    dashboardItem.toggleAttribute("active", dashboard.id === this.selectedDashboard);
                    menu.append(dashboardItem);
                }
            }
        }
    }

    private renderExample(): void {
        const menu = this.query<HTMLElement>("w13c-lateral-menu");
        menu.querySelectorAll("[data-generated]").forEach(element => element.remove());

        const sourceItem = this.createItem("Example source", undefined, "database", "database");
        sourceItem.dataset.generated = "true";
        sourceItem.toggleAttribute("active", true);
        menu.append(sourceItem);

        const dashboardItem = this.createItem("Product dashboard", undefined, "layout", "layout");
        dashboardItem.classList.add("dashboard-item");
        dashboardItem.dataset.generated = "true";
        dashboardItem.toggleAttribute("active", true);
        menu.append(dashboardItem);
    }

    private createItem(label: string, svg: string | undefined, icon: string | undefined, fallback: "database" | "layout"): HTMLElement {
        const item = document.createElement("w13c-lateral-menu-item");
        appendIconSlot(item, svg, icon, fallback);
        item.append(document.createTextNode(label));
        return item;
    }

    private activeGroup(): DashboardSourceGroup | null {
        return this.groups.find(group => group.source.id === this.selectedSource) ?? null;
    }

    private selection(): DashboardSelection {
        return { source: this.selectedSource, dashboard: this.selectedDashboard };
    }

    private syncFromUrl(): void {
        const selection = currentSelection();
        this.selectedSource = selection.source;
        this.selectedDashboard = selection.dashboard;
    }

    private isExampleMode(): boolean {
        return this.hasAttribute("example") || window.location.pathname.replace(/\/+$/, "").endsWith("/admin/sources/example");
    }

    private onClick = (event: Event): void => {
        const target = event.target as Element | null;
        const dashboardButton = target?.closest<HTMLElement>("[data-dashboard]");
        if (dashboardButton?.dataset.source && dashboardButton.dataset.dashboard) {
            this.select(dashboardButton.dataset.source, dashboardButton.dataset.dashboard);
            return;
        }
        const sourceButton = target?.closest<HTMLElement>("[data-source]");
        if (sourceButton?.dataset.source) this.select(sourceButton.dataset.source);
    };

    private onPopState = (): void => {
        this.syncFromUrl();
        this.ensureDashboardSelection();
        this.render();
        dispatchDashboardSelection(currentSelection());
    };

    private onExternalSelection = (event: CustomEvent<DashboardSelection>): void => {
        this.selectedSource = event.detail.source;
        this.selectedDashboard = event.detail.dashboard;
        this.ensureDashboardSelection();
        this.render();
    };

    private query<T extends Element>(selector: string): T {
        return this.shadowRoot!.querySelector(selector) as T;
    }
}

if (!customElements.get("cms-dashboards-nav")) customElements.define("cms-dashboards-nav", DashboardNav);

function parseGroups(value: string): DashboardSourceGroup[] | null {
    if (!value) return null;
    try {
        const parsed = JSON.parse(value);
        return Array.isArray(parsed) ? parsed as DashboardSourceGroup[] : null;
    } catch {
        return null;
    }
}
