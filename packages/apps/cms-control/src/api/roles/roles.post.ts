import type { ControlCms } from "cms-control/ControlCms";
import { readJsonBody } from "cms-control/core/http/readJsonBody";
import { parseRoleDto, upsertRole } from "cms-control/core/roles/mutateRole";

/** POST /api/roles { id, label, grants? } — create or update a role definition. */
export default async function postRole(req: Request, cms: ControlCms) {
    const dto  = parseRoleDto(await readJsonBody(req));
    const role = await upsertRole(cms, dto);
    return Response.json(role);
}
