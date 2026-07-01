import { Component } from "@bernouy/components/base";
import css from "./style.css" with { type: "text" };
import template from "./template.html" with { type: "text" };
import { currentDashboard, currentSource, DASHBOARD_SELECTION_EVENT, fetchDashboards, type DashboardSelection } from "./api";
import { renderWidget } from "./domain";
import { renderIcon } from "./icons";
import type { DashboardSourceGroup } from "./types";

export class DashboardView extends Component {
    private groups: DashboardSourceGroup[] = [];
    private selectedSource = "";
    private selectedDashboard = "";
    private readonly tabState = new Map<string, number>();

    constructor() {
        super({ css: css as unknown as string, template: template as unknown as string });
    }

    override connectedCallback(): void {
        super.connectedCallback();
        this.selectedSource = currentSource();
        this.selectedDashboard = currentDashboard();
        this.shadowRoot!.addEventListener("click", event => this.handleClick(event));
        window.addEventListener(DASHBOARD_SELECTION_EVENT, this.onSelection as EventListener);
        void this.load();
    }

    disconnectedCallback(): void {
        window.removeEventListener(DASHBOARD_SELECTION_EVENT, this.onSelection as EventListener);
    }

    private async load(): Promise<void> {
        try {
            this.groups = await fetchDashboards();
            this.selectedSource ||= this.groups[0]?.source.id ?? "";
            this.ensureDashboardSelection();
        } catch {
            this.groups = [];
        }
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

    private handleClick(event: Event): void {
        const target = event.target as Element | null;
        const tabButton = target?.closest<HTMLElement>("[data-tab-key]");
        if (tabButton?.dataset.tabKey && tabButton.dataset.tabIndex) {
            this.tabState.set(tabButton.dataset.tabKey, Number(tabButton.dataset.tabIndex));
            this.renderWidgets();
        }
    }

    private render(): void {
        this.renderDetail();
    }

    private renderDetail(): void {
        const group = this.activeGroup();
        const dashboard = this.activeDashboard();
        this.query<HTMLElement>("[data-empty]").hidden = Boolean(group);
        this.query<HTMLElement>("[data-source-empty]").hidden = !group || Boolean(dashboard);
        this.query<HTMLElement>("[data-dashboard-head]").hidden = !dashboard;
        this.query<HTMLElement>("[data-widgets]").hidden = !dashboard;
        if (!group) return;

        if (!dashboard) return;
        this.text("[data-dashboard-name]", dashboard.meta?.name ?? dashboard.id);
        renderIcon(this.query<HTMLElement>("[data-dashboard-icon]"), dashboard.meta?.svg, dashboard.meta?.icon, "layout");
        this.renderWidgets();
    }

    private renderWidgets(): void {
        const group = this.activeGroup();
        const dashboard = this.activeDashboard();
        const root = this.query<HTMLElement>("[data-widgets]");
        if (!group || !dashboard) {
            root.replaceChildren();
            return;
        }
        root.innerHTML = dashboard.views
            .map((widget, index) => renderWidget(widget, { group, dashboard }, `root.${index}`, this.tabState))
            .join("");
    }

    private activeGroup(): DashboardSourceGroup | null {
        return this.groups.find(group => group.source.id === this.selectedSource) ?? null;
    }

    private activeDashboard() {
        return this.activeGroup()?.dashboards.find(dashboard => dashboard.id === this.selectedDashboard) ?? null;
    }

    private text(selector: string, value: string): void {
        this.query<HTMLElement>(selector).textContent = value;
    }

    private onSelection = (event: CustomEvent<DashboardSelection>): void => {
        this.selectedSource = event.detail.source;
        this.selectedDashboard = event.detail.dashboard;
        this.ensureDashboardSelection();
        this.renderDetail();
    };

    private query<T extends Element>(selector: string): T {
        return this.shadowRoot!.querySelector(selector) as T;
    }
}

if (!customElements.get("cms-dashboards-admin")) customElements.define("cms-dashboards-admin", DashboardView);
