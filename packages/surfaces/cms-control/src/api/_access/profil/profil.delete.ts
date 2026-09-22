import type { ControlCms } from "cms-control/ControlCms";
import MissingParam from "cms-control/core/admin/http/errors/MissingParam";
import InvalidParam from "cms-control/core/admin/http/errors/InvalidParam";
import { resolveRequestSubject } from "@bernouy/cms-auth";
import { deleteUserCompletely } from "@bernouy/cms-auth/management";

/** DELETE /api/profil — the current user deletes their own account. The session
 *  cookie outlives the row but now resolves to no user, so the
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
