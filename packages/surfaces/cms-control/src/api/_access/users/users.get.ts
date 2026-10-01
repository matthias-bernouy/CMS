import type { ControlCms } from "cms-control/ControlCms";
import type { UsersListOptions } from "@bernouy/cms-auth";
import InvalidParam from "cms-control/core/admin/http/errors/InvalidParam";
import { requireControlAdministrator } from "cms-control/core/admin/control/adminAccess";
import { userView } from "cms-control/core/management/users/userView";

/** GET /api/users lists members. GET /api/users?sub= returns the
 *  enriched detail payload for one user. */
export default async function listUsers(req: Request, cms: ControlCms) {
    const actor = await requireControlAdministrator(req, cms);
    const url = new URL(req.url);
    const sub = url.searchParams.get("sub");
    const administrators = new Set((await cms.config?.administrators?.list()) ?? []);
    const canChange = async (userSub: string) =>
        userSub !== actor.identifier &&
        (!administrators.has(userSub) || Boolean(await cms.config?.administrators?.canRevoke(userSub)));
    if (sub) {
        const user = await cms.users.getBySub(sub);
        if (!user) {
            throw new InvalidParam("sub", "unknown user");
        }
        return Response.json({
            ...(await userView(user, cms.credentials)),
            administrator: administrators.has(user.sub),
            administratorLabel: administrators.has(user.sub) ? "Administrator" : "Member",
            canChangeAdministrator: await canChange(user.sub),
        });
    }

    const opts: UsersListOptions = {};
    const page = await cms.users.list(opts);
    const users = await Promise.all(
        page.users.map(async (user) => ({
            ...(await userView(user, cms.credentials)),
            administrator: administrators.has(user.sub),
            administratorLabel: administrators.has(user.sub) ? "Administrator" : "Member",
            canChangeAdministrator: await canChange(user.sub),
        })),
    );
    return Response.json(users);
}
