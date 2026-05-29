import type { ControlCms } from "cms-control/ControlCms";
import MissingParam from "cms-control/errors/Http/MissingParam";
import InvalidParam from "cms-control/errors/Http/InvalidParam";
import HttpError from "cms-control/errors/Http/HttpError";
import { isLastAdmin } from "cms-control/core/users/lastAdmin";
import { deleteUserCompletely } from "cms-control/core/users/deleteUser";

/** DELETE /api/users?sub= — admin removes another user. Refuses to delete the
 *  last admin (would lock everyone out). Purges the user across the membership,
 *  local-credential and PAT stores. */
export default async function deleteUser(req: Request, cms: ControlCms) {
    const sub = new URL(req.url).searchParams.get("sub");
    if (!sub) throw new MissingParam("sub");

    const user = await cms.users.getBySub(sub);
    if (!user) throw new InvalidParam("sub", "unknown user");
    if (await isLastAdmin(cms, sub)) throw new HttpError(403, "Cannot delete the last admin — promote another admin first.");

    await deleteUserCompletely(cms, user);
    return Response.json({ ok: true });
}
