import type { ControlCms } from "cms-control/ControlCms";
import { readJsonBody } from "cms-control/core/admin/http/readJsonBody";
import InvalidParam from "cms-control/core/admin/http/errors/InvalidParam";
import { requireDashboardAdmin, dashboardCollections } from "cms-control/core/admin/dashboards/access";
import { dashboardFromCatalog } from "cms-control/core/admin/dashboards/catalog";

export default async function changeDashboardMember(request: Request, cms: ControlCms): Promise<Response> {
    await requireDashboardAdmin(request, cms);
    const body = await readJsonBody(request);
    if (
        Object.keys(body).some((key) => !["dashboardId", "subjectId", "action"].includes(key)) ||
        typeof body.dashboardId !== "string" ||
        typeof body.subjectId !== "string" ||
        (body.action !== "assign" && body.action !== "unassign")
    ) {
        throw new InvalidParam("body", "Dashboard, member and action expected");
    }
    dashboardCollections(cms);
    const record = await dashboardFromCatalog(cms, body.dashboardId);
    if (!record) {
        throw Object.assign(new Error("Dashboard not found"), { status: 404 });
    }
    if (body.action === "assign") {
        if (!cms.users || !(await cms.users.getBySub(body.subjectId))) {
            throw new InvalidParam("subjectId", "Unknown member");
        }
        await cms.dashboardAssignments.assign({ dashboardId: record.id, subjectId: body.subjectId });
    } else {
        await cms.dashboardAssignments.unassign(body.subjectId, record.id);
    }
    return Response.json({ members: await cms.dashboardAssignments.getSubjectIdsForDashboard(record.id) });
}
