import { Component } from "@bernouy/components/base";
import css from "./style.css" with { type: "text" };
import template from "./template.html" with { type: "text" };
import { currentDashboard, currentSource, fetchDashboards, route } from "./api";
import { renderWidget } from "./domain";
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
        void this.load();
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

    private select(sourceId: string, dashboardId = ""): void {
        this.selectedSource = sourceId;
        this.selectedDashboard = dashboardId;
        this.ensureDashboardSelection();
        this.replaceUrl();
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

    private replaceUrl(): void {
        const params = new URLSearchParams();
        if (this.selectedSource) params.set("source", this.selectedSource);
        if (this.selectedDashboard) params.set("dashboard", this.selectedDashboard);
        const suffix = params.toString() ? `?${params.toString()}` : "";
        history.replaceState(null, "", route(`/admin/sources${suffix}`));
    }

    private handleClick(event: Event): void {
        const target = event.target as Element | null;
        const sourceButton = target?.closest<HTMLElement>("[data-source]");
        if (sourceButton?.dataset.source) {
            this.select(sourceButton.dataset.source);
            return;
        }
        const dashboardButton = target?.closest<HTMLElement>("[data-dashboard]");
        if (dashboardButton?.dataset.source && dashboardButton.dataset.dashboard) {
            this.select(dashboardButton.dataset.source, dashboardButton.dataset.dashboard);
            return;
        }
        const tabButton = target?.closest<HTMLElement>("[data-tab-key]");
        if (tabButton?.dataset.tabKey && tabButton.dataset.tabIndex) {
            this.tabState.set(tabButton.dataset.tabKey, Number(tabButton.dataset.tabIndex));
            this.renderWidgets();
        }
    }

    private render(): void {
        this.renderList();
        this.renderDetail();
    }

    private renderList(): void {
        const list = this.query<HTMLElement>("[data-list]");
        const sourceTemplate = this.query<HTMLTemplateElement>("[data-source-template]");
        const dashboardTemplate = this.query<HTMLTemplateElement>("[data-dashboard-template]");
        list.replaceChildren();

        if (!this.groups.length) {
            const empty = document.createElement("div");
            empty.className = "empty";
            empty.textContent = "No sources. Install an integration to generate source contracts.";
            list.append(empty);
            return;
        }

        for (const group of this.groups) {
            const sourceItem = sourceTemplate.content.firstElementChild!.cloneNode(true) as HTMLButtonElement;
            sourceItem.dataset.source = group.source.id;
            sourceItem.classList.toggle("active", group.source.id === this.selectedSource);
            sourceItem.querySelector("[data-name]")!.textContent = group.source.name;
            sourceItem.querySelector("[data-meta]")!.textContent = `${group.source.dashboardCount} dashboard${group.source.dashboardCount === 1 ? "" : "s"}`;
            list.append(sourceItem);

            if (group.source.id === this.selectedSource) {
                this.renderDashboardNav(list, dashboardTemplate, group);
            }
        }
    }

    private renderDashboardNav(root: HTMLElement, template: HTMLTemplateElement, group: DashboardSourceGroup): void {
        const nav = document.createElement("div");
        nav.className = "dashboard-nav";
        if (!group.dashboards.length) {
            const empty = document.createElement("small");
            empty.textContent = "No dashboards";
            nav.append(empty);
            root.append(nav);
            return;
        }
        for (const dashboard of group.dashboards) {
            const item = template.content.firstElementChild!.cloneNode(true) as HTMLButtonElement;
            item.dataset.source = group.source.id;
            item.dataset.dashboard = dashboard.id;
            item.classList.toggle("active", dashboard.id === this.selectedDashboard);
            item.querySelector("[data-name]")!.textContent = dashboard.meta?.name ?? dashboard.id;
            item.querySelector("[data-meta]")!.textContent = `${dashboard.views.length} widget${dashboard.views.length === 1 ? "" : "s"}`;
            nav.append(item);
        }
        root.append(nav);
    }

    private renderDetail(): void {
        const group = this.activeGroup();
        const dashboard = this.activeDashboard();
        this.query<HTMLElement>("[data-empty]").hidden = Boolean(group);
        this.query<HTMLElement>("[data-hero]").hidden = !group;
        this.query<HTMLElement>("[data-source-empty]").hidden = !group || Boolean(dashboard);
        this.query<HTMLElement>("[data-dashboard-head]").hidden = !dashboard;
        this.query<HTMLElement>("[data-widgets]").hidden = !dashboard;
        if (!group) return;

        this.text("[data-source-name]", group.source.name);
        this.text("[data-source-urn]", group.source.urn);
        this.text("[data-source-state]", group.source.readonly ? "Readonly" : `${group.source.dashboardCount} dashboards`);

        if (!dashboard) return;
        this.text("[data-dashboard-name]", dashboard.meta?.name ?? dashboard.id);
        this.text("[data-dashboard-meta]", `${group.source.endpointCount} endpoints available`);
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

    private query<T extends Element>(selector: string): T {
        return this.shadowRoot!.querySelector(selector) as T;
    }
}

if (!customElements.get("cms-dashboards-admin")) customElements.define("cms-dashboards-admin", DashboardView);
