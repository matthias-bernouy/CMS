import type { ControlCms } from "cms-control/ControlCms";
import { requiredId } from "cms-control/core/admin/dashboards/input";
import { publishSiteDashboard } from "cms-control/core/admin/dashboards/service";
import { readJsonBody } from "cms-control/core/admin/http/readJsonBody";
import { auditDashboardMutation } from "cms-control/core/admin/dashboards/audit";
import InvalidParam from "cms-control/core/admin/http/errors/InvalidParam";

export default async function publishDashboard(req: Request, cms: ControlCms): Promise<Response> {
    const body = await readJsonBody(req);
    const unknown = Object.keys(body).find((key) => key !== "id");
    if (unknown) {
        throw new InvalidParam(unknown, "is not supported.");
    }
    const id = requiredId(body.id, "id");
    const dashboard = await publishSiteDashboard(cms, id);
    auditDashboardMutation((await cms.auth.getSubject(req))?.identifier ?? "unknown", "publish", id, {
        revision: dashboard.revision,
    });
    return Response.json(dashboard);
}
