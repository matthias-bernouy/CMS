import type { ControlCms } from "cms-control/ControlCms";
import { ADMIN_ROLE } from "@bernouy/cms-permissions";
import { readJsonBody } from "cms-control/core/http/readJsonBody";
import MissingParam from "cms-control/errors/Http/MissingParam";
import InvalidParam from "cms-control/errors/Http/InvalidParam";
import { isLastAdmin } from "@bernouy/cms-auth";
import { assignableRoles } from "cms-control/core/roles/rolesView";

/** POST /api/users/role { sub, role } — the explicit, server-side role
 *  grant/revoke. Authorization is CMS-owned: the role never comes from the
 *  auth provider, only from here. `role` is validated against the dynamic set
 *  of assignable roles (admin + user + custom roles; `public` is not assignable). */
export default async function setUserRole(req: Request, cms: ControlCms) {
    const body = await readJsonBody(req);
    const sub  = body.sub;
    const role = body.role;
    if (typeof sub !== "string" || !sub)   throw new MissingParam("sub");
    if (typeof role !== "string" || !role) throw new MissingParam("role");

    const allowed = await assignableRoles(cms);
    if (!allowed.some((r) => r.id === role)) {
        throw new InvalidParam("role", "unknown or unassignable role");
    }

    // Never strip the last admin — that would lock everyone out of the tenant.
    if (role !== ADMIN_ROLE && await isLastAdmin(cms.users, sub)) {
        throw new InvalidParam("role", "cannot demote the last admin");
    }

    const updated = await cms.users.setRole(sub, role);
    if (!updated) throw new InvalidParam("sub", "unknown user");
    return Response.json(updated);
}
