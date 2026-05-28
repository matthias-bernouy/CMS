import type { ControlCms } from "src/control/ControlCms";
import type { UsersListOptions } from "src/socle/interfaces/UsersRepository";

/** GET /api/users?role= — the admin user list (authz membership). `role` is an
 *  optional filter (any string the membership store stores — server-side check
 *  is just an equality match). */
export default async function listUsers(req: Request, cms: ControlCms) {
    const opts: UsersListOptions = {};
    const role = new URL(req.url).searchParams.get("role");
    if (role) opts.role = role;

    const page = await cms.users.list(opts);
    return Response.json(page.users);
}
