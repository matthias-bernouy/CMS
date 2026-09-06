import { loadSourceInstallations, renderSourceManagement, sourceForInstallation } from "./management";
import type { IntegrationInstallationRow } from "../../Integrations/model";
import { Component } from "@bernouy/components/base";
import {
    currentSelection,
    DASHBOARD_SELECTION_EVENT,
    defaultDashboardSource,
    dispatchDashboardSelection,
    route,
    replaceSelectionUrl,
    type DashboardSelection,
} from "../api";
import { configureDashboardBindingFilters } from "../runtime/mounting/bindingFilters";
import { renderDashboardNavigation, renderDashboardNavigationExample } from "./DashboardNavRendering";
import css from "./nav.css" with { type: "text" };
import template from "./nav.html" with { type: "text" };
import type { DashboardSourceGroup } from "../types";

export class DashboardNav extends Component {
    private installations: IntegrationInstallationRow[] = [];
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
        window.addEventListener("cms-resources:route", this.onResourceRoute);
        window.addEventListener(DASHBOARD_SELECTION_EVENT, this.onExternalSelection as EventListener);
        this.query<HTMLElement>("[data-add-source]").setAttribute("href", route("/admin/sources?tab=catalogue"));
        this.updateCatalogueAction();
        this.startBoundSource();
        document.addEventListener("integration:updated", this.refreshInstallations);
        void this.refreshInstallations();
    }

    disconnectedCallback(): void {
        this.shadowRoot?.removeEventListener("click", this.onClick);
        window.removeEventListener("popstate", this.onPopState);
        window.removeEventListener("cms-resources:route", this.onResourceRoute);
        window.removeEventListener(DASHBOARD_SELECTION_EVENT, this.onExternalSelection as EventListener);
        document.removeEventListener("integration:updated", this.refreshInstallations);
        this.observer?.disconnect();
        this.observer = null;
    }

    private startBoundSource(): void {
        if (this.isExampleMode()) {
            renderDashboardNavigationExample(this.query<HTMLElement>("w13c-lateral-menu"));
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
        if (!next) {
            return;
        }
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
        if (!group.dashboards.some((dashboard) => dashboard.id === this.selectedDashboard)) {
            this.selectedDashboard = group.dashboards[0]?.id ?? "";
        }
    }

    private render(): void {
        const menu = this.query<HTMLElement>("w13c-lateral-menu");
        const params = new URL(window.location.href).searchParams;
        const installation = params.get("integration");
        if (installation) {
            this.selectedSource = sourceForInstallation(installation, this.installations) ?? this.selectedSource;
        }
        this.updateCatalogueAction();
        renderDashboardNavigation(
            menu,
            this.groups,
            params.has("tab") || params.has("setup") ? "" : this.selectedSource,
            installation ? "" : this.selectedDashboard,
        );
        renderSourceManagement(menu, this.selectedSource, this.installations);
    }

    private updateCatalogueAction(): void {
        const params = new URL(window.location.href).searchParams;
        this.query<HTMLElement>("[data-add-source]").toggleAttribute(
            "active",
            params.get("tab") === "catalogue" || params.has("setup"),
        );
    }

    private onResourceRoute = (): void => this.render();

    private refreshInstallations = async (): Promise<void> => {
        if (this.isExampleMode()) {
            return;
        }
        try {
            this.installations = await loadSourceInstallations();
            if (!this.isConnected) {
                return;
            }
            this.render();
        } catch {
            /* Source data navigation remains available when management is unavailable. */
        }
    };

    private activeGroup(): DashboardSourceGroup | null {
        return this.groups.find((group) => group.source.id === this.selectedSource) ?? null;
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
        return (
            this.hasAttribute("example") ||
            window.location.pathname.replace(/\/+$/, "").endsWith("/admin/sources/example")
        );
    }

    private onClick = (event: Event): void => {
        const target = event.target as Element | null;
        const dashboardButton = target?.closest<HTMLElement>("[data-dashboard]");
        if (dashboardButton?.dataset.source && dashboardButton.dataset.dashboard) {
            this.select(dashboardButton.dataset.source, dashboardButton.dataset.dashboard);
            return;
        }
        const sourceButton = target?.closest<HTMLElement>("[data-source]");
        if (sourceButton?.dataset.source) {
            this.select(sourceButton.dataset.source);
        }
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

if (!customElements.get("cms-dashboards-nav")) {
    customElements.define("cms-dashboards-nav", DashboardNav);
}

function parseGroups(value: string): DashboardSourceGroup[] | null {
    if (!value) {
        return null;
    }
    try {
        const parsed = JSON.parse(value);
        return Array.isArray(parsed) ? (parsed as DashboardSourceGroup[]) : null;
    } catch {
        return null;
    }
}
