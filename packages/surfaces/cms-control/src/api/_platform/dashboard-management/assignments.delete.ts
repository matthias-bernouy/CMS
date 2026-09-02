import type { ControlCms } from "cms-control/ControlCms";
import { requiredId, requiredText } from "cms-control/core/admin/dashboards/input";
import { auditDashboardMutation } from "cms-control/core/admin/dashboards/audit";
import InvalidParam from "cms-control/core/admin/http/errors/InvalidParam";
import { readJsonBody } from "cms-control/core/admin/http/readJsonBody";

export default async function removeAssignment(req: Request, cms: ControlCms): Promise<Response> {
    const body = await readJsonBody(req);
    const unknown = Object.keys(body).find((key) => !["dashboardId", "subjectId"].includes(key));
    if (unknown) {
        throw new InvalidParam(unknown, "is not supported.");
    }
    const dashboardId = requiredId(body.dashboardId, "dashboardId");
    const subjectId = requiredText(body.subjectId, "subjectId", 256);
    if (!(await cms.dashboards.getDashboard(dashboardId))) {
        return new Response("Dashboard not found", { status: 404 });
    }
    if (!(await cms.users.getBySub(subjectId))) {
        return new Response("User not found", { status: 404 });
    }
    await cms.dashboardAssignments.unassign(subjectId, dashboardId);
    auditDashboardMutation((await cms.auth.getSubject(req))?.identifier ?? "unknown", "unassign", dashboardId, {
        subjectId,
    });
    return Response.json({ subjectId, dashboardId, assigned: false });
}
