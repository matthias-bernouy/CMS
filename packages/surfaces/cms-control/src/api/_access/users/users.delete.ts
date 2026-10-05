import type { ControlCms } from "cms-control/ControlCms";
import MissingParam from "cms-control/core/admin/http/errors/MissingParam";
import InvalidParam from "cms-control/core/admin/http/errors/InvalidParam";
import { deleteUserCompletely } from "@bernouy/cms-auth/management";
import { requireControlAdministrator } from "cms-control/core/admin/control/adminAccess";

/** DELETE /api/users?sub= — removes a member across the membership, local-credential, and PAT stores. */
export default async function deleteUser(req: Request, cms: ControlCms) {
    const actor = await requireControlAdministrator(req, cms);
    const sub = new URL(req.url).searchParams.get("sub");
    if (!sub) {
        throw new MissingParam("sub");
    }

    const user = await cms.users.getBySub(sub);
    if (!user) {
        throw new InvalidParam("sub", "unknown user");
    }
    if (sub === actor.identifier) {
        throw new InvalidParam("sub", "You cannot remove your own account");
    }
    if ((await cms.config?.administrators?.list())?.includes(sub)) {
        await cms.config.administrators!.set(sub, false);
    }
    await deleteUserCompletely({ users: cms.users, credentials: cms.credentials, pats: cms.pats }, user);
    return Response.json({ ok: true });
}
