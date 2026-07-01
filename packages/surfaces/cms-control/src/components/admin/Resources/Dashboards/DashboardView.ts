import { Component } from "@bernouy/components/base";
import type { DashboardWidget } from "@bernouy/cms-dashboards";
import css from "./style.css" with { type: "text" };
import template from "./template.html" with { type: "text" };
import {
    currentSelection,
    DASHBOARD_SELECTION_EVENT,
    fetchDashboards,
    pushSelectionUrl,
    replaceSelectionUrl,
    type DashboardSelection,
} from "./api";
import { renderWidget } from "./domain";
import { renderIcon } from "./icons";
import type { DashboardSourceGroup } from "./types";

type DetailSelection = {
    collection: string;
    row: string;
};

export class DashboardView extends Component {
    private groups: DashboardSourceGroup[] = [];
    private selectedSource = "";
    private selectedDashboard = "";
    private detailSelection: DetailSelection | null = null;
    private readonly tabState = new Map<string, number>();

    constructor() {
        super({ css: css as unknown as string, template: template as unknown as string });
    }

    override connectedCallback(): void {
        super.connectedCallback();
        this.syncFromSelection(currentSelection());
        this.shadowRoot!.addEventListener("click", this.onClick);
        this.shadowRoot!.addEventListener("keydown", this.onKeydown);
        window.addEventListener("popstate", this.onPopState);
        window.addEventListener(DASHBOARD_SELECTION_EVENT, this.onSelection as EventListener);
        void this.load();
    }

    disconnectedCallback(): void {
        this.shadowRoot?.removeEventListener("click", this.onClick);
        this.shadowRoot?.removeEventListener("keydown", this.onKeydown);
        window.removeEventListener("popstate", this.onPopState);
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
            this.detailSelection = null;
            return;
        }
        if (!group.dashboards.some(dashboard => dashboard.id === this.selectedDashboard)) {
            this.selectedDashboard = group.dashboards[0]?.id ?? "";
            this.detailSelection = null;
        }
    }

    private handleClick(event: Event): void {
        const target = event.target as Element | null;
        if (target?.closest("[data-dashboard-back]")) {
            this.clearDetailSelection();
            return;
        }
        if (this.selectRow(target)) return;

        const tabButton = target?.closest<HTMLElement>("[data-tab-key]");
        if (tabButton?.dataset.tabKey && tabButton.dataset.tabIndex) {
            this.tabState.set(tabButton.dataset.tabKey, Number(tabButton.dataset.tabIndex));
            this.renderWidgets();
        }
    }

    private handleKeydown(event: KeyboardEvent): void {
        if (event.key !== "Enter" && event.key !== " ") return;
        if (!this.selectRow(event.target as Element | null)) return;
        event.preventDefault();
    }

    private selectRow(target: Element | null): boolean {
        const row = target?.closest<HTMLElement>("[data-dashboard-collection][data-dashboard-row-key]");
        const collection = row?.dataset.dashboardCollection;
        const rowKey = row?.dataset.dashboardRowKey;
        if (!collection || !rowKey?.trim()) return false;
        this.detailSelection = { collection, row: rowKey };
        pushSelectionUrl(this.selection());
        this.renderDetail();
        return true;
    }

    private clearDetailSelection(): void {
        if (!this.detailSelection) return;
        this.detailSelection = null;
        replaceSelectionUrl(this.selection());
        this.renderDetail();
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
        this.query<HTMLElement>("[data-detail-toolbar]").hidden = !dashboard || !this.detailSelection;
        this.query<HTMLElement>("[data-widgets]").hidden = !dashboard;
        if (!group) return;

        if (!dashboard) return;
        this.text("[data-dashboard-name]", dashboard.meta?.name ?? dashboard.id);
        renderIcon(this.query<HTMLElement>("[data-dashboard-icon]"), dashboard.meta?.svg, dashboard.meta?.icon, "layout");
        this.text("[data-detail-row]", this.detailSelection?.row ?? "");
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
        const detail = this.detailSelection;
        const widgets = detail ? detailWidgetsFor(dashboard.views, detail.collection) : dashboard.views;
        const selectedRows = new Map<string, string>();
        if (detail) selectedRows.set(detail.collection, detail.row);

        if (detail && !widgets.length) {
            root.innerHTML = `
                <section class="panel empty">
                    <strong>No detail view</strong>
                    <span>This dashboard does not declare a detail widget for this collection.</span>
                </section>
            `;
            return;
        }

        root.innerHTML = widgets
            .map((widget, index) => renderWidget(widget, { group, dashboard, selectedRows }, `root.${index}`, this.tabState))
            .join("");
    }

    private activeGroup(): DashboardSourceGroup | null {
        return this.groups.find(group => group.source.id === this.selectedSource) ?? null;
    }

    private activeDashboard() {
        return this.activeGroup()?.dashboards.find(dashboard => dashboard.id === this.selectedDashboard) ?? null;
    }

    private selection(): DashboardSelection {
        return {
            source: this.selectedSource,
            dashboard: this.selectedDashboard,
            ...(this.detailSelection ? {
                collection: this.detailSelection.collection,
                row: this.detailSelection.row,
            } : {}),
        };
    }

    private syncFromSelection(selection: DashboardSelection): void {
        this.selectedSource = selection.source;
        this.selectedDashboard = selection.dashboard;
        this.detailSelection = selection.collection && selection.row
            ? { collection: selection.collection, row: selection.row }
            : null;
    }

    private text(selector: string, value: string): void {
        this.query<HTMLElement>(selector).textContent = value;
    }

    private onSelection = (event: CustomEvent<DashboardSelection>): void => {
        this.syncFromSelection(event.detail);
        this.ensureDashboardSelection();
        this.renderDetail();
    };

    private readonly onPopState = (): void => {
        this.syncFromSelection(currentSelection());
        this.ensureDashboardSelection();
        this.renderDetail();
    };

    private readonly onClick = (event: Event): void => {
        this.handleClick(event);
    };

    private readonly onKeydown = (event: Event): void => {
        this.handleKeydown(event as KeyboardEvent);
    };

    private query<T extends Element>(selector: string): T {
        return this.shadowRoot!.querySelector(selector) as T;
    }
}

function detailWidgetsFor(widgets: DashboardWidget[], collection: string): DashboardWidget[] {
    const result: DashboardWidget[] = [];
    for (const widget of widgets) {
        if (widget.widget === "w-detail" && widget.collection === collection) {
            result.push(widget);
            continue;
        }
        if (widget.widget === "w-section") {
            const children = detailWidgetsFor(widget.children, collection);
            if (children.length) result.push({ ...widget, children });
            continue;
        }
        if (widget.widget === "w-tabs") {
            const tabs = widget.tabs
                .map(tab => ({ label: tab.label, children: detailWidgetsFor(tab.children, collection) }))
                .filter(tab => tab.children.length);
            if (tabs.length) result.push({ ...widget, tabs });
        }
    }
    return result;
}

if (!customElements.get("cms-dashboards-admin")) customElements.define("cms-dashboards-admin", DashboardView);
