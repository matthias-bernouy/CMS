import type { ControlCms } from "cms-control/ControlCms";
import InvalidParam from "cms-control/core/admin/http/errors/InvalidParam";
import { readJsonBody } from "cms-control/core/admin/http/readJsonBody";
import { requireDashboardAdmin, dashboardCollections } from "cms-control/core/admin/dashboards/access";
import { dashboardFromCatalog } from "cms-control/core/admin/dashboards/catalog";

export default async function deleteDashboard(request: Request, cms: ControlCms): Promise<Response> {
    await requireDashboardAdmin(request, cms);
    const body = await readJsonBody(request);
    if (
        Object.keys(body).some((key) => !["id", "revision"].includes(key)) ||
        typeof body.id !== "string" ||
        !Number.isSafeInteger(body.revision)
    ) {
        throw new InvalidParam("body", "Dashboard ID and revision required");
    }
    const siteId = dashboardCollections(cms).siteId;
    const record = await dashboardFromCatalog(cms, body.id);
    if (!record || record.origin) {
        throw new InvalidParam("id", "Only private dashboards can be deleted");
    }
    if (!(await cms.dashboards.delete(siteId, body.id, body.revision as number))) {
        throw Object.assign(new Error("Dashboard changed; reload before deleting"), { status: 409 });
    }
    await cms.dashboardAssignments.deleteForDashboard(body.id);
    return Response.json({ deleted: true });
}
