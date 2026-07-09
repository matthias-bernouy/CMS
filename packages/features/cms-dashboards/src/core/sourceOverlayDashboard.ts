import type { SourceOverlay } from "@bernouy/cms-sources";
import type { DashboardDto, DashboardWidget } from "../interfaces/Dashboard";
import { applyDetailSourceOverlay } from "./sourceOverlayDashboard/detail";
import { addOverlayTableColumns } from "./sourceOverlayDashboard/table";

export function applyDashboardSourceOverlays(
    dashboard: DashboardDto,
    overlays: readonly SourceOverlay[],
): DashboardDto {
    const relevant = overlays.filter(overlay =>
        overlay.sourceId === dashboard.source
        && (overlay.fields.length || overlay.dashboardFields?.length),
    );
    if (!relevant.length) return structuredClone(dashboard);

    const next = structuredClone(dashboard);
    next.views = next.views.map(widget => applyWidgetSourceOverlays(widget, relevant, dashboard.id));
    return next;
}

function applyWidgetSourceOverlays(
    widget: DashboardWidget,
    overlays: readonly SourceOverlay[],
    dashboardId: string,
): DashboardWidget {
    if (widget.widget === "w-section") {
        return { ...widget, children: widget.children.map(child => applyWidgetSourceOverlays(child, overlays, dashboardId)) };
    }
    if (widget.widget === "w-tabs") {
        return {
            ...widget,
            tabs: widget.tabs.map(tab => ({
                ...tab,
                children: tab.children.map(child => applyWidgetSourceOverlays(child, overlays, dashboardId)),
            })),
        };
    }
    if (widget.widget === "w-table") {
        return overlays.reduce((next, overlay) => addOverlayTableColumns(next, overlay), widget);
    }
    if (widget.widget === "w-detail") {
        return overlays.reduce((next, overlay) => applyDetailSourceOverlay(next, overlay, dashboardId), widget);
    }
    return widget;
}
