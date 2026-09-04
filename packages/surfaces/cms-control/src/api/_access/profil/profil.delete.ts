import type { ControlCms } from "cms-control/ControlCms";
import MissingParam from "cms-control/core/admin/http/errors/MissingParam";
import InvalidParam from "cms-control/core/admin/http/errors/InvalidParam";
import HttpError from "cms-control/core/admin/http/errors/HttpError";
import { deleteUserCompletely, isLastAdmin, resolveRequestSubject } from "@bernouy/cms-auth";

/** DELETE /api/profil — the current user deletes their OWN account. Refuses if
 *  they are the last admin (no one would be left to administer the tenant).
 *  The session cookie outlives the row but now resolves to no user, so the
 *  client redirects to logout afterwards to clear it. */
export default async function deleteOwnAccount(req: Request, cms: ControlCms) {
    const subject = await resolveRequestSubject(cms.auth, req);
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

    await deleteUserCompletely(
        {
            users: cms.users,
            credentials: cms.credentials,
            pats: cms.pats,
            beforeMembershipDelete: async ({ sub: subjectId }) => {
                await cms.dashboardAssignments.deleteForSubject(subjectId);
            },
        },
        user,
    );
    return Response.json({ ok: true });
}
