import type { ControlCms } from "cms-control/ControlCms";
import { requiredId, requiredText } from "cms-control/core/admin/dashboards/input";
import InvalidParam from "cms-control/core/admin/http/errors/InvalidParam";
import { readJsonBody } from "cms-control/core/admin/http/readJsonBody";
import { auditDashboardMutation } from "cms-control/core/admin/dashboards/audit";

export default async function changeAssignment(req: Request, cms: ControlCms): Promise<Response> {
    const body = await readJsonBody(req);
    const unknown = Object.keys(body).find((key) => !["dashboardId", "subjectId", "assigned"].includes(key));
    if (unknown) {
        throw new InvalidParam(unknown, "is not supported.");
    }
    const dashboardId = requiredId(body.dashboardId, "dashboardId");
    const subjectId = requiredText(body.subjectId, "subjectId", 256);
    if (body.assigned !== undefined && typeof body.assigned !== "boolean") {
        throw new InvalidParam("assigned", "must be boolean when provided.");
    }
    const dashboard = await cms.dashboards.getDashboard(dashboardId);
    if (!dashboard) {
        throw new InvalidParam("dashboardId", "does not identify a dashboard.");
    }
    if (!(await cms.users.getBySub(subjectId))) {
        throw new InvalidParam("subjectId", "does not identify a CMS user.");
    }
    const assigned = body.assigned ?? true;
    if (assigned) {
        await cms.dashboardAssignments.assign({ subjectId, dashboardId });
    } else {
        await cms.dashboardAssignments.unassign(subjectId, dashboardId);
    }
    auditDashboardMutation(
        (await cms.auth.getSubject(req))?.identifier ?? "unknown",
        assigned ? "assign" : "unassign",
        dashboardId,
        { subjectId },
    );
    return Response.json({ subjectId, dashboardId, assigned });
}
