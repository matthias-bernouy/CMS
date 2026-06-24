import type { ControlCms } from "cms-control/ControlCms";
import type { UsersListOptions } from "@bernouy/cms-auth";

/** GET /api/users?role= — the admin user list (authz membership). `role` is an
 *  optional filter (any string the membership store stores — server-side check
 *  is just an equality match). */
export default async function listUsers(req: Request, cms: ControlCms) {
    const opts: UsersListOptions = {};
    const role = new URL(req.url).searchParams.get("role");
    if (role) opts.role = role;

    const page = await cms.users.list(opts);
    const users = await Promise.all(page.users.map(async (user) => {
        if (user.provider !== "local" || !user.email) {
            return { ...user, emailVerifiedAt: null };
        }
        const credential = await cms.credentials.getByEmail(user.email);
        return { ...user, emailVerifiedAt: credential?.emailVerifiedAt ?? null };
    }));
    return Response.json(users);
}
