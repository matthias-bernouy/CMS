import type { ControlCms } from "cms-control/ControlCms";
import { requiredId } from "cms-control/core/admin/dashboards/input";
import { deleteSiteDashboard } from "cms-control/core/admin/dashboards/service";
import { auditDashboardMutation } from "cms-control/core/admin/dashboards/audit";

export default async function deleteDashboard(req: Request, cms: ControlCms): Promise<Response> {
    const id = requiredId(new URL(req.url).searchParams.get("id"), "id");
    await deleteSiteDashboard(cms, id);
    auditDashboardMutation((await cms.auth.getSubject(req))?.identifier ?? "unknown", "delete", id);
    return new Response(null, { status: 204 });
}
