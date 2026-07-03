import type { DashboardDto, DashboardWidget } from "@bernouy/cms-dashboards";
import type { DashboardSourceGroup } from "./types";

export type DetailSelection = {
    collection: string;
    row: string;
};

export type RenderContext = {
    group: DashboardSourceGroup;
    dashboard: DashboardDto;
    selectedRows: ReadonlyMap<string, string>;
    drafts: ReadonlyMap<string, Record<string, unknown>>;
};

export function widgetsForSelection(dashboard: DashboardDto, detail: DetailSelection | null): DashboardWidget[] {
    return detail ? detailWidgetsFor(dashboard.views, detail.collection) : mainWidgetsFor(dashboard.views);
}

export function detailKey(collection: string, row: string): string {
    return `${collection}:${row}`;
}

function mainWidgetsFor(widgets: DashboardWidget[]): DashboardWidget[] {
    return widgets.flatMap(widget => {
        if (isDetailWidget(widget)) return [];
        if (widget.widget === "w-section") return sectionWithChildren(widget, mainWidgetsFor(widget.children));
        if (widget.widget === "w-tabs") return tabsWithChildren(widget, tab => mainWidgetsFor(tab.children));
        return [widget];
    });
}

function detailWidgetsFor(widgets: DashboardWidget[], detailWidgetId: string): DashboardWidget[] {
    return widgets.flatMap(widget => {
        if (widget.widget === "w-section") return detailWidgetsFor(widget.children, detailWidgetId);
        if (widget.widget === "w-tabs") return widget.tabs.flatMap(tab => detailWidgetsFor(tab.children, detailWidgetId));
        return isDetailWidget(widget) && widget.id === detailWidgetId ? [widget] : [];
    });
}

function sectionWithChildren(widget: Extract<DashboardWidget, { widget: "w-section" }>, children: DashboardWidget[]): DashboardWidget[] {
    return children.length ? [{ ...widget, children }] : [];
}

function tabsWithChildren(widget: Extract<DashboardWidget, { widget: "w-tabs" }>, map: (tab: { id: string; label: string; children: DashboardWidget[] }) => DashboardWidget[]): DashboardWidget[] {
    const tabs = widget.tabs.map(tab => ({ id: tab.id, label: tab.label, children: map(tab) })).filter(tab => tab.children.length);
    return tabs.length ? [{ ...widget, tabs }] : [];
}

function isDetailWidget(widget: DashboardWidget): boolean {
    return widget.widget === "w-detail";
}
