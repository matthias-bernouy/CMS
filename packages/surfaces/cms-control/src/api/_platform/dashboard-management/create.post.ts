import type { ControlCms } from "cms-control/ControlCms";
import { parseDashboardInput } from "cms-control/core/admin/dashboards/input";
import { createSiteDashboard } from "cms-control/core/admin/dashboards/service";
import { readJsonBody } from "cms-control/core/admin/http/readJsonBody";
import { auditDashboardMutation } from "cms-control/core/admin/dashboards/audit";

export default async function createDashboard(req: Request, cms: ControlCms): Promise<Response> {
    const subject = await cms.auth.getSubject(req);
    if (!subject) {
        return new Response("Unauthorized", { status: 401 });
    }
    const dashboard = await createSiteDashboard(cms, parseDashboardInput(await readJsonBody(req)), subject.identifier);
    auditDashboardMutation(subject.identifier, "create", dashboard.id, { revision: dashboard.revision });
    return Response.json(dashboard, { status: 201 });
}
