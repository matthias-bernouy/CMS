import type { ControlCms } from "cms-control/ControlCms";
import { dashboardManagementPresentation } from "cms-control/core/admin/dashboards/presentation";

export default async function listDashboardManagement(req: Request, cms: ControlCms): Promise<Response> {
    const requestedId = new URL(req.url).searchParams.get("id") ?? "";
    return Response.json(await dashboardManagementPresentation(cms, requestedId));
}
