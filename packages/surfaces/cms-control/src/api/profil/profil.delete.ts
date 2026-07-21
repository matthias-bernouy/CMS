import type { ControlCms } from "cms-control/ControlCms";
import MissingParam from "cms-control/errors/Http/MissingParam";
import InvalidParam from "cms-control/errors/Http/InvalidParam";
import HttpError from "cms-control/errors/Http/HttpError";
import { isLastAdmin } from "@bernouy/cms-auth";
import { deleteUserCompletely } from "@bernouy/cms-auth";

/** DELETE /api/profil — the current user deletes their OWN account. Refuses if
 *  they are the last admin (no one would be left to administer the tenant).
 *  The session cookie outlives the row but now resolves to no user, so the
 *  client redirects to logout afterwards to clear it. */
export default async function deleteOwnAccount(req: Request, cms: ControlCms) {
    const subject = await cms.auth.getSubject(req);
    if (!subject) {
        throw new MissingParam("session");
    }

    const user = await cms.users.getBySub(subject.identifier);
    if (!user) {
        throw new InvalidParam("session", "unknown user");
    }
    if (await isLastAdmin(cms.users, subject.identifier)) {
        throw new HttpError(403, "You are the last admin — promote another admin first to delete your account.");
    }

    await deleteUserCompletely({ users: cms.users, credentials: cms.credentials, pats: cms.pats }, user);
    return Response.json({ ok: true });
}
