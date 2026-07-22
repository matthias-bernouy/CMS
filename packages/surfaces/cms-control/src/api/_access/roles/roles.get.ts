import type { ControlCms } from "cms-control/ControlCms";
import { manageableRoles } from "cms-control/core/management/roles/rolesView";
import InvalidParam from "cms-control/core/admin/http/errors/InvalidParam";

/** GET /api/roles — the Roles management table (virtual admin + built-ins + customs). */
export default async function listRoles(req: Request, cms: ControlCms) {
    const id = new URL(req.url).searchParams.get("id");
    const rows = await manageableRoles(cms);
    if (!id) {
        return Response.json(rows);
    }
    const row = rows.find((role) => role.id === id);
    if (!row) {
        throw new InvalidParam("id", "unknown role");
    }
    return Response.json(row);
}
