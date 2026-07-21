import { showToast } from "@bernouy/components";
import { Component } from "@bernouy/components/base";
import css from "./style.css" with { type: "text" };
import template from "./template.html" with { type: "text" };
import {
    currentSelection,
    DASHBOARD_SELECTION_EVENT,
    defaultDashboardSource,
    fetchDashboards,
    pushSelectionUrl,
    replaceSelectionUrl,
    route,
    type DashboardSelection,
} from "./api";
import { runDashboardMediaAction, runDashboardWidgetAction } from "./DashboardViewActions";
import { runDashboardLookupCreate } from "./DashboardViewLookups";
import { detailKey, DetailResourceState, type DetailSelection, validDetailSelection } from "./domain";
import { isDashboardExampleMode } from "./mode";
import { renderDashboardShell, renderExampleShell } from "./rendering";
import { configureDashboardBindingFilters } from "./runtime/bindingFilters";
import { detailReloadEvent } from "./runtime/reload";
import type { DashboardSourceGroup } from "./types";
import { updateDashboardWidgetExampleField } from "./widgets/example";
import {
    WIDGET_ACTION_EVENT,
    WIDGET_BACK_EVENT,
    WIDGET_FIELD_CHANGE_EVENT,
    WIDGET_MEDIA_ACTION_EVENT,
    WIDGET_ROW_SELECT_EVENT,
    type WidgetActionDetail,
    type WidgetFieldChangeDetail,
    type WidgetMediaActionDetail,
    type WidgetRowSelectDetail,
} from "./widgets/shared";

export class DashboardView extends Component {
    private groups: DashboardSourceGroup[] = [];
    private selectedSource = "";
    private selectedDashboard = "";
    private detailSelection: DetailSelection | null = null;
    private readonly tabState = new Map<string, number>();
    private readonly drafts = new Map<string, Record<string, unknown>>();
    private readonly detailResource = new DetailResourceState();
    private definitionsReloadGeneration = 0;
    private observer: MutationObserver | null = null;

    constructor() {
        super({ css: css as unknown as string, template: template as unknown as string });
        configureDashboardBindingFilters();
    }
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
        this.startBoundSource();
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
        this.observer?.disconnect();
        this.observer = null;
        this.definitionsReloadGeneration += 1;
        this.detailResource.clear();
    }

    private startBoundSource(): void {
        if (this.isExampleMode()) {
            return this.render();
        }
        const source = this.shadowRoot!.querySelector<HTMLElement>("[data-dashboard-list-source]");
        source?.setAttribute("cms-source", `${route("/api/dashboards")} as dashboards`);
        this.observer = new MutationObserver(() => this.readBoundGroups());
        if (source) {
            this.observer.observe(source, { attributes: true, childList: true, subtree: true });
        }
        this.readBoundGroups();
    }

    private readBoundGroups(): void {
        const target = this.shadowRoot!.querySelector<HTMLElement>("[data-dashboard-groups-json]");
        const next = parseGroups(target?.dataset.dashboardGroupsJson ?? "");
        if (!next) {
            return;
        }
        this.groups = next;
        this.selectedSource ||= defaultDashboardSource(this.groups);
        this.ensureDashboardSelection();
        this.render();
    }

    private ensureDashboardSelection(invalidateActions = true): void {
        const clearDetailResource = (): void => {
            if (invalidateActions) {
                this.detailResource.clear();
            } else {
                this.detailResource.clearResource();
            }
        };
        const group = this.activeGroup();
        if (!group) {
            clearDetailResource();
            this.selectedDashboard = "";
            this.detailSelection = null;
            return;
        }
        if (!group.dashboards.some((dashboard) => dashboard.id === this.selectedDashboard)) {
            clearDetailResource();
            this.selectedDashboard = group.dashboards[0]?.id ?? "";
            this.detailSelection = null;
            return;
        }
        const dashboard = group.dashboards.find((candidate) => candidate.id === this.selectedDashboard)!;
        if (this.detailSelection && !validDetailSelection(dashboard, this.detailSelection)) {
            clearDetailResource();
            this.detailSelection = null;
            if (!this.isExampleMode()) {
                replaceSelectionUrl(this.selection());
            }
        }
    }

    private render(): void {
        if (this.isExampleMode()) {
            renderExampleShell(this.shadowRoot!, this.detailSelection?.row ?? null);
            return;
        }
        const group = this.activeGroup();
        const dashboard = this.activeDashboard();
        renderDashboardShell(
            this.shadowRoot!,
            group,
            dashboard,
            this.detailSelection,
            this.tabState,
            this.drafts,
            dashboard ? this.detailResource.current(dashboard.source, dashboard.id, this.detailSelection) : null,
        );
    }

    private activeGroup(): DashboardSourceGroup | null {
        return this.groups.find((group) => group.source.id === this.selectedSource) ?? null;
    }
    private activeDashboard() {
        return this.activeGroup()?.dashboards.find((dashboard) => dashboard.id === this.selectedDashboard) ?? null;
    }
    private isExampleMode(): boolean {
        return isDashboardExampleMode(this);
    }
    private selection(): DashboardSelection {
        return {
            source: this.selectedSource,
            dashboard: this.selectedDashboard,
            ...(this.detailSelection ? this.detailSelection : {}),
        };
    }

    private syncFromSelection(selection: DashboardSelection): void {
        this.detailResource.clear();
        this.selectedSource = selection.source;
        this.selectedDashboard = selection.dashboard;
        this.detailSelection =
            selection.collection && selection.row ? { collection: selection.collection, row: selection.row } : null;
    }

    private onClick = (event: Event): void => {
        const tabButton = (event.target as Element | null)?.closest<HTMLElement>("[data-tab-key]");
        if (!tabButton?.dataset.tabKey || !tabButton.dataset.tabIndex) {
            return;
        }
        this.tabState.set(tabButton.dataset.tabKey, Number(tabButton.dataset.tabIndex));
        this.render();
    };

    private onSelection = (event: CustomEvent<DashboardSelection>): void => this.syncSelectionAndRender(event.detail);
    private onPopState = (): void => this.syncSelectionAndRender(currentSelection());
    private onWidgetRowSelect = (event: CustomEvent<WidgetRowSelectDetail>): void => {
        this.detailResource.clear();
        this.detailSelection = { collection: event.detail.collection, row: event.detail.rowKey };
        if (!this.isExampleMode()) {
            pushSelectionUrl(this.selection());
        }
        this.render();
    };

    private onWidgetBack = (): void => {
        this.detailResource.clear();
        this.detailSelection = null;
        if (!this.isExampleMode()) {
            replaceSelectionUrl(this.selection());
        }
        this.render();
    };

    private onWidgetAction = (event: CustomEvent<WidgetActionDetail>): void => {
        if (this.isExampleMode()) {
            showToast(`${event.detail.action} clicked`, { type: "success" });
            return;
        }
        if (event.detail.target) {
            this.detailResource.clear();
            this.detailSelection = { collection: event.detail.target, row: "__new__" };
            if (!this.isExampleMode()) {
                pushSelectionUrl(this.selection());
            }
            this.render();
            return;
        }
        void runDashboardWidgetAction(this.actionContext(), event.detail);
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
        if (!this.detailSelection) {
            return;
        }
        const key = detailKey(this.detailSelection.collection, event.detail.rowKey);
        const previousDraft = this.drafts.get(key) ?? {};
        this.drafts.set(key, { ...previousDraft, [event.detail.field]: event.detail.value });
        if (event.detail.created) {
            void runDashboardLookupCreate(this.actionContext(), event.detail, previousDraft, event.target);
        }
    };

    private syncSelectionAndRender(selection: DashboardSelection): void {
        this.syncFromSelection(selection);
        this.ensureDashboardSelection();
        this.render();
    }

    private actionContext() {
        return {
            group: this.activeGroup(),
            groups: this.groups,
            dashboard: this.activeDashboard(),
            detail: this.detailSelection,
            drafts: this.drafts,
            render: () => this.render(),
            reloadDefinitions: () => this.reloadDefinitions(),
            reload: (collection: string, row: string) => this.reloadDetail(collection, row),
            clearDetail: () => this.clearDetail(),
            openDetail: (collection: string, row: string) => this.openDetail(collection, row),
            setDetailResource: (collection: string, row: string, resource: unknown) =>
                this.setDetailResource(collection, row, resource),
            actionCoordinator: this.detailResource,
        };
    }

    private openDetail(collection: string, row: string): void {
        const dashboard = this.activeDashboard();
        const detail = { collection, row };
        if (!dashboard || !validDetailSelection(dashboard, detail)) {
            this.detailResource.clearResource();
            this.detailSelection = null;
            if (!this.isExampleMode()) {
                replaceSelectionUrl(this.selection());
            }
            this.render();
            return;
        }
        if (!this.detailResource.matches(dashboard.source, dashboard.id, collection, row)) {
            this.detailResource.clearResource();
        }
        this.detailSelection = detail;
        if (!this.isExampleMode()) {
            replaceSelectionUrl(this.selection());
        }
        this.render();
    }

    private clearDetail(): void {
        this.detailResource.clearResource();
        this.detailSelection = null;
        if (!this.isExampleMode()) {
            replaceSelectionUrl(this.selection());
        }
        this.render();
    }

    private reloadDetail(collection: string, row: string): void {
        const dashboard = this.activeDashboard();
        if (!dashboard) {
            return;
        }
        if (this.detailResource.clearResource()) {
            this.render();
            return;
        }
        document.dispatchEvent(new CustomEvent(detailReloadEvent(dashboard.source, dashboard.id, collection, row)));
    }

    private async reloadDefinitions(): Promise<void> {
        const generation = ++this.definitionsReloadGeneration;
        const groups = await fetchDashboards();
        if (generation !== this.definitionsReloadGeneration) {
            return;
        }
        this.detailResource.clearResource();
        this.groups = groups;
        this.selectedSource ||= defaultDashboardSource(this.groups);
        this.ensureDashboardSelection(false);
    }

    private setDetailResource(collection: string, row: string, resource: unknown): void {
        const dashboard = this.activeDashboard();
        if (dashboard) {
            this.detailResource.set(dashboard.source, dashboard.id, collection, row, resource);
        }
    }
}

if (!customElements.get("cms-dashboards-admin")) {
    customElements.define("cms-dashboards-admin", DashboardView);
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
