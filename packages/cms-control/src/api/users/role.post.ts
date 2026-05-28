import type { ControlCms } from "src/control/ControlCms";
import type { CMS_ROLES } from "types/roles";
import { readJsonBody } from "src/control/core/http/readJsonBody";
import MissingParam from "src/control/errors/Http/MissingParam";
import InvalidParam from "src/control/errors/Http/InvalidParam";

const ROLES: CMS_ROLES[] = ["admin", "user"];

/** POST /api/users/role { sub, role } — the explicit, server-side role
 *  grant/revoke. Authorization is CMS-owned: the role never comes from the
 *  auth provider, only from here. */
export default async function setUserRole(req: Request, cms: ControlCms) {
    const body = await readJsonBody(req);
    const sub = body.sub;
    const role = body.role;
    if (typeof sub !== "string" || !sub) throw new MissingParam("sub");
    if (typeof role !== "string" || !ROLES.includes(role as CMS_ROLES)) {
        throw new InvalidParam("role", "expected one of: admin, user");
    }

    // Never strip the last admin — that would lock everyone out of the tenant.
    if ((role as CMS_ROLES) !== "admin") {
        const current = await cms.users.getBySub(sub);
        if (current?.role === "admin") {
            const admins = await cms.users.list({ role: "admin" });
            if (admins.total <= 1) throw new InvalidParam("role", "cannot demote the last admin");
        }
    }

    const updated = await cms.users.setRole(sub, role as CMS_ROLES);
    if (!updated) throw new InvalidParam("sub", "unknown user");
    return Response.json(updated);
}
