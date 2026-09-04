import type { ControlCms } from "cms-control/ControlCms";
import { parseDashboardInput, requiredId } from "cms-control/core/admin/dashboards/input";
import { updateSiteDashboard } from "cms-control/core/admin/dashboards/service";
import { readJsonBody } from "cms-control/core/admin/http/readJsonBody";
import { auditDashboardMutation } from "cms-control/core/admin/dashboards/audit";

export default async function updateDashboard(req: Request, cms: ControlCms): Promise<Response> {
    const body = await readJsonBody(req);
    const id = requiredId(body.id, "id");
    const dashboard = await updateSiteDashboard(cms, id, parseDashboardInput(body));
    auditDashboardMutation((await cms.auth.getSubject(req))?.identifier ?? "unknown", "update", id, {
        revision: dashboard.revision,
    });
    return Response.json(dashboard);
}
