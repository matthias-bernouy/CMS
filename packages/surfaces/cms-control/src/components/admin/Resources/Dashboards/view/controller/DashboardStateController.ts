import { Component } from "@bernouy/components/base";
import type { DashboardDto } from "@bernouy/cms-dashboards";
import { defaultDashboardSource, fetchDashboards, replaceSelectionUrl, type DashboardSelection } from "../../api";
import { DetailResourceState, type DetailSelection, validDetailSelection } from "../../domain";
import { isDashboardExampleMode } from "../../navigation/mode";
import type { DashboardSourceGroup } from "../../types";

export abstract class DashboardStateController extends Component {
    protected groups: DashboardSourceGroup[] = [];
    protected selectedSource = "";
    protected selectedDashboard = "";
    protected detailSelection: DetailSelection | null = null;
    protected readonly tabState = new Map<string, number>();
    protected readonly drafts = new Map<string, Record<string, unknown>>();
    protected readonly detailResource = new DetailResourceState();
    private readonly dashboardFilterState = new Map<string, Map<string, Record<string, string>>>();
    private definitionsReloadGeneration = 0;

    constructor(css: string, template: string) {
        super({ css, template });
    }

    protected abstract renderDashboard(): void;

    protected disconnectState(): void {
        this.definitionsReloadGeneration += 1;
        this.detailResource.clear();
        this.dashboardFilterState.clear();
    }

    protected ensureDashboardSelection(invalidateActions = true): void {
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
        const dashboard = group.dashboards.find((candidate) => candidate.id === this.selectedDashboard);
        if (!dashboard) {
            clearDetailResource();
            this.selectedDashboard = group.dashboards[0]?.id ?? "";
            this.detailSelection = null;
            return;
        }
        if (this.detailSelection && !validDetailSelection(dashboard, this.detailSelection)) {
            clearDetailResource();
            this.detailSelection = null;
            if (!this.isExampleMode()) {
                replaceSelectionUrl(this.selection());
            }
        }
    }

    protected activeGroup(): DashboardSourceGroup | null {
        return this.groups.find((group) => group.source.id === this.selectedSource) ?? null;
    }

    protected activeDashboard(): DashboardDto | null {
        return this.activeGroup()?.dashboards.find((dashboard) => dashboard.id === this.selectedDashboard) ?? null;
    }

    protected isExampleMode(): boolean {
        return isDashboardExampleMode(this);
    }

    protected selection(): DashboardSelection {
        return {
            source: this.selectedSource,
            dashboard: this.selectedDashboard,
            ...(this.detailSelection ? this.detailSelection : {}),
        };
    }

    protected syncFromSelection(selection: DashboardSelection): void {
        this.detailResource.clear();
        this.selectedSource = selection.source;
        this.selectedDashboard = selection.dashboard;
        this.detailSelection =
            selection.collection && selection.row ? { collection: selection.collection, row: selection.row } : null;
    }

    protected invalidateDetailResource(): void {
        this.detailResource.clear();
    }

    protected dashboardFilters(): ReadonlyMap<string, Readonly<Record<string, string>>> {
        return this.dashboardFilterState.get(this.dashboardFilterKey()) ?? new Map();
    }

    protected setDashboardFilters(widget: string, filters: Record<string, string>): void {
        if (!widget) {
            return;
        }
        const key = this.dashboardFilterKey();
        const current = this.dashboardFilterState.get(key) ?? new Map<string, Record<string, string>>();
        if (Object.keys(filters).length) {
            current.set(widget, { ...filters });
            this.dashboardFilterState.set(key, current);
            return;
        }
        current.delete(widget);
        if (!current.size) {
            this.dashboardFilterState.delete(key);
        }
    }

    protected openDetail(collection: string, row: string): void {
        const dashboard = this.activeDashboard();
        const detail = { collection, row };
        if (!dashboard || !validDetailSelection(dashboard, detail)) {
            this.detailResource.clearResource();
            this.detailSelection = null;
            if (!this.isExampleMode()) {
                replaceSelectionUrl(this.selection());
            }
            this.renderDashboard();
            return;
        }
        if (!this.detailResource.matches(dashboard.source, dashboard.id, collection, row)) {
            this.detailResource.clearResource();
        }
        this.detailSelection = detail;
        if (!this.isExampleMode()) {
            replaceSelectionUrl(this.selection());
        }
        this.renderDashboard();
    }

    protected clearDetail(): void {
        this.detailResource.clearResource();
        this.detailSelection = null;
        if (!this.isExampleMode()) {
            replaceSelectionUrl(this.selection());
        }
        this.renderDashboard();
    }

    protected async reloadDefinitions(): Promise<void> {
        if (this.hasAttribute("external")) {
            window.dispatchEvent(new CustomEvent("cms-dashboard-workspace:reload"));
            return;
        }
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

    protected setDetailResource(collection: string, row: string, resource: unknown): void {
        const dashboard = this.activeDashboard();
        if (dashboard) {
            this.detailResource.set(dashboard.source, dashboard.id, collection, row, resource);
        }
    }

    private dashboardFilterKey(): string {
        return `${this.selectedSource}\u0000${this.selectedDashboard}`;
    }
}
