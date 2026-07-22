import { Component } from "@bernouy/components/base";
import type { DashboardDto } from "@bernouy/cms-dashboards";
import {
    defaultDashboardSource,
    fetchDashboards,
    replaceSelectionUrl,
    route,
    type DashboardSelection,
} from "../../api";
import { type DetailSelection } from "../../domain";
import { isDashboardExampleMode } from "../../navigation/mode";
import { detailReloadEvent } from "../../runtime/reload";
import type { DashboardSourceGroup } from "../../types";
import type { DashboardViewActionContext } from "../DashboardViewActions";
import { renderDashboardShell, renderExampleShell } from "../rendering";

export class DashboardViewController extends Component {
    protected groups: DashboardSourceGroup[] = [];
    protected selectedSource = "";
    protected selectedDashboard = "";
    protected detailSelection: DetailSelection | null = null;
    protected readonly tabState = new Map<string, number>();
    protected readonly drafts = new Map<string, Record<string, unknown>>();
    private observer: MutationObserver | null = null;

    constructor(css: string, template: string) {
        super({ css, template });
    }

    protected startBoundSource(): void {
        if (this.isExampleMode()) {
            this.renderDashboard();
            return;
        }
        const source = this.shadowRoot!.querySelector<HTMLElement>("[data-dashboard-list-source]");
        source?.setAttribute("cms-source", `${route("/api/dashboards")} as dashboards`);
        this.observer = new MutationObserver(() => this.readBoundGroups());
        if (source) {
            this.observer.observe(source, { attributes: true, childList: true, subtree: true });
        }
        this.readBoundGroups();
    }

    protected disconnectBoundSource(): void {
        this.observer?.disconnect();
        this.observer = null;
    }

    protected ensureDashboardSelection(): void {
        const group = this.activeGroup();
        if (!group) {
            this.selectedDashboard = "";
            this.detailSelection = null;
            return;
        }
        if (!group.dashboards.some((dashboard) => dashboard.id === this.selectedDashboard)) {
            this.selectedDashboard = group.dashboards[0]?.id ?? "";
            this.detailSelection = null;
        }
    }

    protected renderDashboard(): void {
        if (this.isExampleMode()) {
            renderExampleShell(this.shadowRoot!, this.detailSelection?.row ?? null);
            return;
        }
        renderDashboardShell(
            this.shadowRoot!,
            this.activeGroup(),
            this.activeDashboard(),
            this.detailSelection,
            this.tabState,
            this.drafts,
        );
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
        this.selectedSource = selection.source;
        this.selectedDashboard = selection.dashboard;
        this.detailSelection =
            selection.collection && selection.row ? { collection: selection.collection, row: selection.row } : null;
    }

    protected syncSelectionAndRender(selection: DashboardSelection): void {
        this.syncFromSelection(selection);
        this.ensureDashboardSelection();
        this.renderDashboard();
    }

    protected actionContext(): DashboardViewActionContext {
        return {
            group: this.activeGroup(),
            groups: this.groups,
            dashboard: this.activeDashboard(),
            detail: this.detailSelection,
            drafts: this.drafts,
            render: () => this.renderDashboard(),
            reloadDefinitions: () => this.reloadDefinitions(),
            reload: (collection, row) => this.reloadDetail(collection, row),
            clearDetail: () => this.clearDetail(),
            openDetail: (collection, row) => this.openDetail(collection, row),
        };
    }

    protected openDetail(collection: string, row: string): void {
        this.detailSelection = { collection, row };
        if (!this.isExampleMode()) {
            replaceSelectionUrl(this.selection());
        }
        this.renderDashboard();
    }

    protected clearDetail(): void {
        this.detailSelection = null;
        if (!this.isExampleMode()) {
            replaceSelectionUrl(this.selection());
        }
        this.renderDashboard();
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
        this.renderDashboard();
    }

    private reloadDetail(collection: string, row: string): void {
        const dashboard = this.activeDashboard();
        if (!dashboard) {
            return;
        }
        document.dispatchEvent(new CustomEvent(detailReloadEvent(dashboard.source, dashboard.id, collection, row)));
    }

    private async reloadDefinitions(): Promise<void> {
        this.groups = await fetchDashboards();
        this.selectedSource ||= defaultDashboardSource(this.groups);
        this.ensureDashboardSelection();
        this.renderDashboard();
    }
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
