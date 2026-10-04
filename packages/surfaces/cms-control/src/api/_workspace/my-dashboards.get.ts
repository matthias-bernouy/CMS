import type { ControlCms } from "cms-control/ControlCms";
import { dashboardCollections, dashboardSubject } from "cms-control/core/admin/dashboards/access";
import { dashboardCatalog } from "cms-control/core/admin/dashboards/catalog";
import { requestLocale } from "cms-control/core/admin/http/requestLocale";

export default async function myDashboards(request: Request, cms: ControlCms): Promise<Response> {
    const subject = await dashboardSubject(request, cms);
    dashboardCollections(cms);
    const ids = new Set(await cms.dashboardAssignments.getDashboardIdsForSubject(subject.identifier));
    const dashboards = (await dashboardCatalog(cms, requestLocale(request)))
        .filter((item) => item.enabled && ids.has(item.id))
        .map((record) => ({
            id: record.id,
            name: record.name,
            icon: record.icon ?? "layout",
            navigation: record.navigation,
        }));
    return Response.json({ dashboards }, { headers: { "Cache-Control": "private, no-store" } });
}
