import type { ControlCms } from "cms-control/ControlCms";
import InvalidParam from "cms-control/core/admin/http/errors/InvalidParam";
import { canReadDashboard, dashboardCollections, dashboardSubject } from "cms-control/core/admin/dashboards/access";
import { dashboardFromCatalog } from "cms-control/core/admin/dashboards/catalog";
import { renderDashboardView, resolveDashboardView } from "cms-control/core/admin/dashboards/view";
import { requestLocale } from "cms-control/core/admin/http/requestLocale";

export default async function readDashboardView(request: Request, cms: ControlCms): Promise<Response> {
    const subject = await dashboardSubject(request, cms);
    const url = new URL(request.url);
    const dashboardId = url.searchParams.get("dashboardId");
    const viewId = url.searchParams.get("viewId");
    if (!dashboardId || !viewId) {
        throw new InvalidParam("dashboardId", "Dashboard and view are required");
    }
    const { siteId, store } = dashboardCollections(cms);
    const locale = requestLocale(request);
    const dashboard = await dashboardFromCatalog(cms, dashboardId, locale);
    if (!dashboard) {
        throw Object.assign(new Error("Dashboard not found"), { status: 404 });
    }
    const administrator = Boolean(cms.config.administrator && (await cms.config.administrator(subject)));
    const assigned = administrator || (await cms.dashboardAssignments.hasAssignment(subject.identifier, dashboard.id));
    if (!canReadDashboard(dashboard, administrator, assigned)) {
        throw Object.assign(new Error("Dashboard access denied"), { status: 403 });
    }
    const resolved = resolveDashboardView(dashboard, viewId, (await store.snapshot(siteId)).collections);
    if (!resolved) {
        throw Object.assign(new Error("View is unavailable"), { status: 404 });
    }
    const rendered = await renderDashboardView(cms, resolved, locale);
    if (url.searchParams.get("runtime") === "1") {
        return new Response(rendered.runtime, {
            headers: { "Cache-Control": "private, no-store", "Content-Type": "text/javascript; charset=utf-8" },
        });
    }
    return Response.json(
        {
            dashboard: dashboard.name,
            label: resolved.selected.label,
            html: rendered.html,
            hasRuntime: rendered.runtime.length > 0,
            navigation: dashboard.navigation,
        },
        { headers: { "Cache-Control": "private, no-store" } },
    );
}
