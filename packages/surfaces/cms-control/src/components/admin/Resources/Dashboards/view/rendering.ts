import type { DashboardDto } from "@bernouy/cms-dashboards";
import { widgetsForSelection, type DetailSelection } from "../domain";
import { renderIcon } from "../navigation/icons";
import type { DashboardSourceGroup } from "../types";
import { mountDashboardWidgetExample } from "../widgets/example";
import { mountDashboardWidgets } from "../runtime/mounting/mount";

export function renderDashboardShell(
    root: ShadowRoot,
    group: DashboardSourceGroup | null,
    dashboard: DashboardDto | null | undefined,
    detail: DetailSelection | null,
    tabState: Map<string, number>,
    drafts: ReadonlyMap<string, Record<string, unknown>>,
    groups: readonly DashboardSourceGroup[] = group ? [group] : [],
    filters: ReadonlyMap<string, Readonly<Record<string, string>>> = new Map(),
): void {
    query(root, "[data-empty]").hidden = Boolean(group);
    query(root, "[data-source-empty]").hidden = !group || Boolean(dashboard);
    query(root, "[data-dashboard-head]").hidden = !dashboard;
    query(root, "[data-detail-toolbar]").hidden = true;
    query(root, "[data-widget-panel]").hidden = !dashboard;
    if (!group || !dashboard) {
        return;
    }
    query(root, "[data-dashboard-name]").textContent = dashboard.meta?.name ?? dashboard.id;
    renderIcon(query(root, "[data-dashboard-icon]"), dashboard.meta?.svg, dashboard.meta?.icon, "layout");
    const selectedRows = new Map<string, string>();
    if (detail) {
        selectedRows.set(detail.collection, detail.row);
    }
    const widgets = widgetsForSelection(dashboard, detail);
    mountDashboardWidgets(
        query(root, "[data-widgets]"),
        widgets,
        { group, groups, dashboard, selectedRows, drafts, filters },
        "root",
        tabState,
        detail,
    );
}

export function renderExampleShell(root: ShadowRoot, selectedRow: string | null): void {
    query(root, "[data-empty]").hidden = true;
    query(root, "[data-source-empty]").hidden = true;
    query(root, "[data-detail-toolbar]").hidden = true;
    query(root, "[data-dashboard-head]").hidden = false;
    query(root, "[data-widget-panel]").hidden = false;
    query(root, "[data-dashboard-name]").textContent = "Dashboard widgets example";
    renderIcon(query(root, "[data-dashboard-icon]"), undefined, "layout", "layout");
    mountDashboardWidgetExample(query(root, "[data-widgets]"), selectedRow);
}

function query<T extends HTMLElement>(root: ShadowRoot, selector: string): T {
    return (selector === "[data-widgets]" ? root.host.querySelector(selector) : root.querySelector(selector)) as T;
}
