import type { ControlCms } from "cms-control/ControlCms";
import { assignableRoles } from "cms-control/core/management/roles/rolesView";

/** GET /api/roles/list — roles assignable to a user (for dropdowns); excludes `public`. */
export default async function listAssignableRoles(_req: Request, cms: ControlCms) {
    return Response.json(await assignableRoles(cms));
}
