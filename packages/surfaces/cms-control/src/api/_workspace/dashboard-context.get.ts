import type { ControlCms } from "cms-control/ControlCms";
import { dashboardNavigationViews } from "@bernouy/cms-dashboards";
import InvalidParam from "cms-control/core/admin/http/errors/InvalidParam";
import { canReadDashboard, dashboardCollections, dashboardSubject } from "cms-control/core/admin/dashboards/access";
import { dashboardFromCatalog } from "cms-control/core/admin/dashboards/catalog";
import { requestLocale } from "cms-control/core/admin/http/requestLocale";

export default async function dashboardContext(request: Request, cms: ControlCms): Promise<Response> {
    const subject = await dashboardSubject(request, cms);
    const id = new URL(request.url).searchParams.get("dashboardId");
    if (!id) {
        throw new InvalidParam("dashboardId", "Dashboard ID required");
    }
    dashboardCollections(cms);
    const record = await dashboardFromCatalog(cms, id, requestLocale(request));
    if (!record) {
        throw Object.assign(new Error("Dashboard not found"), { status: 404 });
    }
    const administrator = Boolean(cms.config.administrator && (await cms.config.administrator(subject)));
    const assigned = administrator || (await cms.dashboardAssignments.hasAssignment(subject.identifier, id));
    if (!canReadDashboard(record, administrator, assigned)) {
        throw Object.assign(new Error("Dashboard access denied"), { status: 403 });
    }
    return Response.json(
        { name: record.name, viewCount: dashboardNavigationViews(record.navigation).length },
        { headers: { "Cache-Control": "private, no-store" } },
    );
}
