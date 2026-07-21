import type { DashboardDto } from "@bernouy/cms-dashboards";

export function withActionResource(
    dashboard: DashboardDto,
    widgetId: string,
    actionId: string,
    resource: string,
): DashboardDto {
    const next = structuredClone(dashboard);
    const widget = next.views.find((entry) => entry.id === widgetId);
    if (
        !widget ||
        (widget.widget !== "w-detail" && widget.widget !== "w-table" && widget.widget !== "w-navigation-list")
    ) {
        throw new Error(`Widget "${widgetId}" was not found`);
    }
    const action = widget.actions?.find((entry) => entry.id === actionId);
    if (!action) {
        throw new Error(`Action "${actionId}" was not found`);
    }
    const mutable = action as unknown as {
        after?: { opens?: string; row?: string; resource?: string };
    };
    mutable.after = { ...(mutable.after ?? {}), resource };
    return next;
}
