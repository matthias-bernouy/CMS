import type { ControlCms } from "cms-control/ControlCms";
import { readJsonBody } from "cms-control/core/http/readJsonBody";
import { parseRoleDto } from "cms-control/core/roles/mutateRole";
import { upsertRole } from "@bernouy/cms-permissions";

/** POST /api/roles { id, label, grants? } — create or update a role definition. */
export default async function postRole(req: Request, cms: ControlCms) {
    const dto  = parseRoleDto(await readJsonBody(req));
    const role = await upsertRole(cms.roles, dto);
    return Response.json(role);
}
