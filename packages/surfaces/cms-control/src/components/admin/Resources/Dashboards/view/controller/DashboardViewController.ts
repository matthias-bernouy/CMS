import { defaultDashboardSource, route, type DashboardSelection } from "../../api";
import { detailReloadEvent } from "../../runtime/reload";
import type { DashboardSourceGroup } from "../../types";
import type { DashboardViewActionContext } from "../actions";
import { renderDashboardShell, renderExampleShell } from "../rendering";
import { DashboardStateController } from "./DashboardStateController";

export class DashboardViewController extends DashboardStateController {
    private observer: MutationObserver | null = null;

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
        this.disconnectState();
    }

    protected renderDashboard(): void {
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
            setDetailResource: (collection, row, resource) => this.setDetailResource(collection, row, resource),
            actionCoordinator: this.detailResource,
        };
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
        if (this.detailResource.clearResource()) {
            this.renderDashboard();
            return;
        }
        document.dispatchEvent(new CustomEvent(detailReloadEvent(dashboard.source, dashboard.id, collection, row)));
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
