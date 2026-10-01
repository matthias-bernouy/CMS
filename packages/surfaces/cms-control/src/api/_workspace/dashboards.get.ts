import type { ControlCms } from "cms-control/ControlCms";
import { requireDashboardAdmin, dashboardCollections } from "cms-control/core/admin/dashboards/access";
import { availableDashboardViews } from "cms-control/core/admin/dashboards/model";
import { dashboardCatalog } from "cms-control/core/admin/dashboards/catalog";

export default async function listDashboards(request: Request, cms: ControlCms): Promise<Response> {
    await requireDashboardAdmin(request, cms);
    dashboardCollections(cms);
    const records = await dashboardCatalog(cms);
    const dashboards = await Promise.all(
        records.map(async (record) => ({
            ...record,
            members: await cms.dashboardAssignments.getSubjectIdsForDashboard(record.id),
        })),
    );
    return Response.json(
        { dashboards, views: await availableDashboardViews(cms) },
        { headers: { "Cache-Control": "private, no-store" } },
    );
}
