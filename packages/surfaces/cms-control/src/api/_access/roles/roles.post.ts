import type { ControlCms } from "cms-control/ControlCms";
import { readJsonBody } from "cms-control/core/admin/http/readJsonBody";
import { assertGatewayGrantsWithinAccess } from "cms-control/core/management/roles/gatewayAccess";
import { parseRoleDto } from "cms-control/core/management/roles/mutateRole";
import { upsertRole } from "@bernouy/cms-permissions";

/** POST /api/roles { id, label, grants? } — create or update a role definition. */
export default async function postRole(req: Request, cms: ControlCms) {
    const dto = parseRoleDto(await readJsonBody(req));
    let sources = null;
    try {
        sources = cms.sources;
    } catch {
        sources = null;
    }
    await assertGatewayGrantsWithinAccess(sources, dto.id, dto.grants);
    const role = await upsertRole(cms.roles, dto);
    return Response.json(role);
}
