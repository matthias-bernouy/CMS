import "./icons/Icon";
import { readSourceData, refreshSourceContext, setSourceContext, setSourceData } from "@bernouy/components";
import { navigationContext, exampleGroups } from "./binding/context";
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
import css from "./nav.css" with { type: "text" };
import template from "./nav.html" with { type: "text" };
import type { DashboardSourceGroup } from "../types";

export class DashboardNav extends Component {
    private groups: DashboardSourceGroup[] = [];
    private selectedSource = "";
    private selectedDashboard = "";
    private readonly project = navigationContext();

    constructor() {
        super({ css: css as unknown as string, template: template as unknown as string });
    }

    override connectedCallback(): void {
        super.connectedCallback();
        this.syncFromUrl();
        this.addEventListener("click", this.onClick);
        window.addEventListener("popstate", this.onPopState);
        window.addEventListener("cms-resources:route", this.onResourceRoute);
        window.addEventListener(DASHBOARD_SELECTION_EVENT, this.onExternalSelection as EventListener);
        setSourceContext(this, () => this.context());
        this.startBoundSource();
    }

    disconnectedCallback(): void {
        this.removeEventListener("click", this.onClick);
        window.removeEventListener("popstate", this.onPopState);
        window.removeEventListener("cms-resources:route", this.onResourceRoute);
        window.removeEventListener(DASHBOARD_SELECTION_EVENT, this.onExternalSelection as EventListener);
    }

    private startBoundSource(): void {
        this.setAttribute("data-nav-list-source", "");
        this.setAttribute("cms-reload-on", "dashboard:definitions-changed");
        this.setAttribute("cms-source", this.isExampleMode() ? "" : `${route("/api/dashboards")} as dashboards`);
        if (this.isExampleMode()) {
            setSourceData(this, exampleGroups);
        }
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

    private context(): Record<string, unknown> {
        const data = readSourceData(this);
        this.groups = Array.isArray(data) ? data : [];
        this.selectedSource ||= defaultDashboardSource(this.groups);
        if (Array.isArray(data)) {
            this.ensureDashboardSelection();
        }
        return {
            ...this.project(this.groups, this.selectedSource, this.selectedDashboard, this.isExampleMode()),
            navReady: Array.isArray(data),
            navEmpty: Array.isArray(data) && this.groups.length === 0,
        };
    }

    private render(): void {
        refreshSourceContext(this);
    }

    private onResourceRoute = (): void => {
        this.syncFromUrl();
        this.render();
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
        if (target?.closest("[data-nav-retry]")) {
            this.ownerDocument.dispatchEvent(new Event("dashboard:definitions-changed"));
            return;
        }
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
}

if (!customElements.get("cms-dashboards-nav")) {
    customElements.define("cms-dashboards-nav", DashboardNav);
}
