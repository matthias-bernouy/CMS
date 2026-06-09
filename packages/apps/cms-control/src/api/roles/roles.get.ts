import type { ControlCms } from "cms-control/ControlCms";
import { manageableRoles } from "cms-control/core/roles/rolesView";

/** GET /api/roles — the Roles management table (virtual admin + built-ins + customs). */
export default async function listRoles(_req: Request, cms: ControlCms) {
    return Response.json(await manageableRoles(cms));
}
