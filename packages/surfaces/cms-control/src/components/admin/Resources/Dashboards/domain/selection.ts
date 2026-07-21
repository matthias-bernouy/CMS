import type { DashboardDto, DashboardWidget } from "@bernouy/cms-dashboards";
import type { DashboardRelationProjection } from "@bernouy/cms-relations";
import { relationWidgetsFor } from "./relations";
import type { DashboardRuntimeWidget, DetailSelection } from "./types";

export function widgetsForSelection(
    dashboard: DashboardDto,
    detail: DetailSelection | null,
    projections: readonly DashboardRelationProjection[] = [],
): DashboardRuntimeWidget[] {
    if (!detail) {
        return mainWidgetsFor(dashboard.views, detailTargetsFor(dashboard.views));
    }
    const relationWidgets = relationWidgetsFor(dashboard, detail, projections);
    return detailWidgetsFor(dashboard.views, detail.collection).map((widget) =>
        relationWidgets.length ? { ...widget, relationWidgets } : widget,
    );
}

export function detailKey(collection: string, row: string): string {
    return `${collection}:${row}`;
}

export function validDetailSelection(dashboard: DashboardDto, detail: DetailSelection | null): DetailSelection | null {
    return detail && detailWidgetsFor(dashboard.views, detail.collection).length ? detail : null;
}

function mainWidgetsFor(widgets: DashboardWidget[], detailTargets: ReadonlySet<string>): DashboardWidget[] {
    return widgets.flatMap((widget) => {
        if (isDetailWidget(widget)) {
            return detailTargets.has(widget.id) ? [] : [widget];
        }
        if (widget.widget === "w-section") {
            return sectionWithChildren(widget, mainWidgetsFor(widget.children, detailTargets));
        }
        if (widget.widget === "w-tabs") {
            return tabsWithChildren(widget, (tab) => mainWidgetsFor(tab.children, detailTargets));
        }
        return [widget];
    });
}

function detailTargetsFor(widgets: DashboardWidget[]): Set<string> {
    const targets = new Set<string>();
    for (const widget of widgets) {
        collectDetailTargets(widget, targets);
    }
    return targets;
}

function collectDetailTargets(widget: DashboardWidget, targets: Set<string>): void {
    if (widget.widget === "w-table" || widget.widget === "w-navigation-list") {
        if (widget.selection?.opens) {
            targets.add(widget.selection.opens);
        }
        for (const action of widget.actions ?? []) {
            if (action.selection?.opens) {
                targets.add(action.selection.opens);
            }
            if (action.after?.opens) {
                targets.add(action.after.opens);
            }
        }
        return;
    }
    if (widget.widget === "w-section") {
        for (const child of widget.children) {
            collectDetailTargets(child, targets);
        }
        return;
    }
    if (widget.widget === "w-tabs") {
        for (const tab of widget.tabs) {
            for (const child of tab.children) {
                collectDetailTargets(child, targets);
            }
        }
    }
}

function detailWidgetsFor(widgets: DashboardWidget[], detailWidgetId: string): DashboardWidget[] {
    return widgets.flatMap((widget) => {
        if (widget.widget === "w-section") {
            return detailWidgetsFor(widget.children, detailWidgetId);
        }
        if (widget.widget === "w-tabs") {
            return widget.tabs.flatMap((tab) => detailWidgetsFor(tab.children, detailWidgetId));
        }
        return isDetailWidget(widget) && widget.id === detailWidgetId ? [widget] : [];
    });
}

function sectionWithChildren(
    widget: Extract<DashboardWidget, { widget: "w-section" }>,
    children: DashboardWidget[],
): DashboardWidget[] {
    return children.length ? [{ ...widget, children }] : [];
}

function tabsWithChildren(
    widget: Extract<DashboardWidget, { widget: "w-tabs" }>,
    map: (tab: { id: string; label: string; children: DashboardWidget[] }) => DashboardWidget[],
): DashboardWidget[] {
    const tabs = widget.tabs
        .map((tab) => ({ id: tab.id, label: tab.label, children: map(tab) }))
        .filter((tab) => tab.children.length);
    return tabs.length ? [{ ...widget, tabs }] : [];
}

function isDetailWidget(widget: DashboardWidget): boolean {
    return widget.widget === "w-detail";
}
