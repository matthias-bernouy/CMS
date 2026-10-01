import type { ControlCms } from "cms-control/ControlCms";
import InvalidParam from "cms-control/core/admin/http/errors/InvalidParam";
import { canReadDashboard, dashboardCollections, dashboardSubject } from "cms-control/core/admin/dashboards/access";
import { dashboardFromCatalog } from "cms-control/core/admin/dashboards/catalog";
import { navigationMounts, recordNavigation } from "cms-control/core/admin/dashboards/navigation";

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
    const navigation = recordNavigation(dashboard);
    const mounts = navigationMounts(navigation);
    const mount = mounts.find((item) => `${item.collectionId}:${item.viewId}` === viewId);
    const installed = (await store.snapshot(siteId)).collections.find(
        (item) => item.collectionId === mount?.collectionId,
    );
    const view = installed?.release.views?.find((item) => item.id === mount?.viewId);
    if (!mount || !view) {
        throw Object.assign(new Error("View is unavailable"), { status: 404 });
    }
    return Response.json(
        {
            dashboard: dashboard.name,
            label: mount.label,
            html: view.html,
            navigation,
            mounts: mounts.map((item) => ({
                viewId: `${item.collectionId}:${item.viewId}`,
                label: item.label,
            })),
        },
        { headers: { "Cache-Control": "private, no-store" } },
    );
}
