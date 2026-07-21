import type { ControlCms } from "cms-control/ControlCms";
import type { UsersListOptions } from "@bernouy/cms-auth";
import InvalidParam from "cms-control/errors/Http/InvalidParam";
import { userView } from "cms-control/core/users/userView";

/** GET /api/users?role= lists admin users. GET /api/users?sub= returns the
 *  enriched detail payload for one user. */
export default async function listUsers(req: Request, cms: ControlCms) {
    const url = new URL(req.url);
    const sub = url.searchParams.get("sub");
    if (sub) {
        const user = await cms.users.getBySub(sub);
        if (!user) {
            throw new InvalidParam("sub", "unknown user");
        }
        return Response.json(await userView(user, cms.credentials));
    }

    const opts: UsersListOptions = {};
    const role = url.searchParams.get("role");
    if (role) {
        opts.role = role;
    }

    const page = await cms.users.list(opts);
    const users = await Promise.all(page.users.map((user) => userView(user, cms.credentials)));
    return Response.json(users);
}
