import { showToast } from "@bernouy/components";
import { Component } from "@bernouy/components/base";
import css from "./style.css" with { type: "text" };
import template from "./template.html" with { type: "text" };
import { currentSelection, DASHBOARD_SELECTION_EVENT, fetchDashboards, pushSelectionUrl, replaceSelectionUrl, type DashboardSelection } from "./api";
import { runDashboardMediaAction, runDashboardWidgetAction } from "./DashboardViewActions";
import { fieldChangeNeedsRender } from "./DashboardViewFields";
import { runDashboardLookupCreate } from "./DashboardViewLookups";
import { detailKey, type DetailSelection } from "./domain";
import { isDashboardExampleMode } from "./mode";
import { renderDashboardShell, renderExampleShell } from "./rendering";
import type { DashboardSourceGroup } from "./types";
import { updateDashboardWidgetExampleField } from "./widgets/example";
import { WIDGET_ACTION_EVENT, WIDGET_BACK_EVENT, WIDGET_FIELD_CHANGE_EVENT, WIDGET_MEDIA_ACTION_EVENT, WIDGET_ROW_SELECT_EVENT, type WidgetActionDetail, type WidgetFieldChangeDetail, type WidgetMediaActionDetail, type WidgetRowSelectDetail } from "./widgets/shared";

export class DashboardView extends Component {
    private groups: DashboardSourceGroup[] = [];
    private selectedSource = "";
    private selectedDashboard = "";
    private detailSelection: DetailSelection | null = null;
    private readonly tabState = new Map<string, number>();
    private readonly drafts = new Map<string, Record<string, unknown>>();

    constructor() { super({ css: css as unknown as string, template: template as unknown as string }); }
    override connectedCallback(): void {
        super.connectedCallback();
        this.syncFromSelection(currentSelection());
        this.shadowRoot!.addEventListener("click", this.onClick);
        this.shadowRoot!.addEventListener(WIDGET_ROW_SELECT_EVENT, this.onWidgetRowSelect as EventListener);
        this.shadowRoot!.addEventListener(WIDGET_BACK_EVENT, this.onWidgetBack);
        this.shadowRoot!.addEventListener(WIDGET_ACTION_EVENT, this.onWidgetAction as EventListener);
        this.shadowRoot!.addEventListener(WIDGET_FIELD_CHANGE_EVENT, this.onWidgetFieldChange as EventListener);
        this.shadowRoot!.addEventListener(WIDGET_MEDIA_ACTION_EVENT, this.onWidgetMediaAction as EventListener);
        window.addEventListener("popstate", this.onPopState);
        window.addEventListener(DASHBOARD_SELECTION_EVENT, this.onSelection as EventListener);
        void this.load();
    }

    disconnectedCallback(): void {
        this.shadowRoot?.removeEventListener("click", this.onClick);
        this.shadowRoot?.removeEventListener(WIDGET_ROW_SELECT_EVENT, this.onWidgetRowSelect as EventListener);
        this.shadowRoot?.removeEventListener(WIDGET_BACK_EVENT, this.onWidgetBack);
        this.shadowRoot?.removeEventListener(WIDGET_ACTION_EVENT, this.onWidgetAction as EventListener);
        this.shadowRoot?.removeEventListener(WIDGET_FIELD_CHANGE_EVENT, this.onWidgetFieldChange as EventListener);
        this.shadowRoot?.removeEventListener(WIDGET_MEDIA_ACTION_EVENT, this.onWidgetMediaAction as EventListener);
        window.removeEventListener("popstate", this.onPopState);
        window.removeEventListener(DASHBOARD_SELECTION_EVENT, this.onSelection as EventListener);
    }

    private async load(): Promise<void> {
        if (this.isExampleMode()) return this.render();
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

    private render(): void {
        this.isExampleMode()
            ? renderExampleShell(this.shadowRoot!, this.detailSelection?.row ?? null)
            : renderDashboardShell(this.shadowRoot!, this.activeGroup(), this.activeDashboard(), this.detailSelection, this.tabState, this.drafts);
    }

    private activeGroup(): DashboardSourceGroup | null { return this.groups.find(group => group.source.id === this.selectedSource) ?? null; }
    private activeDashboard() { return this.activeGroup()?.dashboards.find(dashboard => dashboard.id === this.selectedDashboard) ?? null; }
    private isExampleMode(): boolean { return isDashboardExampleMode(this); }
    private selection(): DashboardSelection { return { source: this.selectedSource, dashboard: this.selectedDashboard, ...(this.detailSelection ? this.detailSelection : {}) }; }

    private syncFromSelection(selection: DashboardSelection): void {
        this.selectedSource = selection.source;
        this.selectedDashboard = selection.dashboard;
        this.detailSelection = selection.collection && selection.row ? { collection: selection.collection, row: selection.row } : null;
    }

    private onClick = (event: Event): void => {
        const tabButton = (event.target as Element | null)?.closest<HTMLElement>("[data-tab-key]");
        if (!tabButton?.dataset.tabKey || !tabButton.dataset.tabIndex) return;
        this.tabState.set(tabButton.dataset.tabKey, Number(tabButton.dataset.tabIndex));
        this.render();
    };

    private onSelection = (event: CustomEvent<DashboardSelection>): void => this.syncSelectionAndRender(event.detail);
    private onPopState = (): void => this.syncSelectionAndRender(currentSelection());
    private onWidgetRowSelect = (event: CustomEvent<WidgetRowSelectDetail>): void => {
        this.detailSelection = { collection: event.detail.collection, row: event.detail.rowKey };
        if (!this.isExampleMode()) pushSelectionUrl(this.selection());
        this.render();
    };

    private onWidgetBack = (): void => { this.detailSelection = null; if (!this.isExampleMode()) replaceSelectionUrl(this.selection()); this.render(); };

    private onWidgetAction = (event: CustomEvent<WidgetActionDetail>): void => {
        if (this.isExampleMode()) {
            showToast(`${event.detail.action} clicked`, { type: "success" });
            return;
        }
        void runDashboardWidgetAction(this.actionContext(), event.detail.action);
    };

    private onWidgetMediaAction = (event: CustomEvent<WidgetMediaActionDetail>): void => {
        if (this.isExampleMode()) {
            showToast(`Media ${event.detail.action} event captured`, { type: "success" });
            return;
        }
        void runDashboardMediaAction(this.actionContext(), event.detail);
    };

    private onWidgetFieldChange = (event: CustomEvent<WidgetFieldChangeDetail>): void => {
        if (this.isExampleMode()) {
            updateDashboardWidgetExampleField(event.detail.rowKey, event.detail.field, event.detail.value);
            this.render();
            return;
        }
        if (!this.detailSelection) return;
        const key = detailKey(this.detailSelection.collection, event.detail.rowKey);
        const previousDraft = this.drafts.get(key) ?? {};
        this.drafts.set(key, { ...previousDraft, [event.detail.field]: event.detail.value });
        if (event.detail.created) void runDashboardLookupCreate(this.actionContext(), event.detail, previousDraft);
        if (fieldChangeNeedsRender(this.activeDashboard(), this.detailSelection, event.detail.field)) this.render();
    };

    private syncSelectionAndRender(selection: DashboardSelection): void {
        this.syncFromSelection(selection);
        this.ensureDashboardSelection();
        this.render();
    }

    private actionContext() {
        return { group: this.activeGroup(), dashboard: this.activeDashboard(), detail: this.detailSelection, drafts: this.drafts, render: () => this.render() };
    }
}

if (!customElements.get("cms-dashboards-admin")) customElements.define("cms-dashboards-admin", DashboardView);
