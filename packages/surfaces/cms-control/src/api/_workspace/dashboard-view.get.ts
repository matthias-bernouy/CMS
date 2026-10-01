import type { ControlCms } from "cms-control/ControlCms";
import { dashboardNavigationViews } from "@bernouy/cms-dashboards";
import InvalidParam from "cms-control/core/admin/http/errors/InvalidParam";
import { canReadDashboard, dashboardCollections, dashboardSubject } from "cms-control/core/admin/dashboards/access";
import { dashboardFromCatalog } from "cms-control/core/admin/dashboards/catalog";

export default async function readDashboardView(request: Request, cms: ControlCms): Promise<Response> {
    const subject = await dashboardSubject(request, cms);
    const url = new URL(request.url);
    const dashboardId = url.searchParams.get("dashboardId");
    const viewId = url.searchParams.get("viewId");
    if (!dashboardId || !viewId) {
        throw new InvalidParam("dashboardId", "Dashboard and view are required");
    }
    const { siteId, store } = dashboardCollections(cms);
    const dashboard = await dashboardFromCatalog(cms, dashboardId);
    if (!dashboard) {
        throw Object.assign(new Error("Dashboard not found"), { status: 404 });
    }
    const administrator = Boolean(cms.config.administrator && (await cms.config.administrator(subject)));
    const assigned = administrator || (await cms.dashboardAssignments.hasAssignment(subject.identifier, dashboard.id));
    if (!canReadDashboard(dashboard, administrator, assigned)) {
        throw Object.assign(new Error("Dashboard access denied"), { status: 403 });
    }
    const navigation = dashboard.navigation;
    const selected = dashboardNavigationViews(navigation).find((item) => item.use === viewId);
    const [collectionId, selectedViewId] = selected?.use.split(":") ?? [];
    const installed = (await store.snapshot(siteId)).collections.find((item) => item.collectionId === collectionId);
    const view = installed?.release.views?.find((item) => item.id === selectedViewId);
    if (!selected || !view) {
        throw Object.assign(new Error("View is unavailable"), { status: 404 });
    }
    return Response.json(
        {
            dashboard: dashboard.name,
            label: selected.label,
            html: view.html,
            navigation,
        },
        { headers: { "Cache-Control": "private, no-store" } },
    );
}
