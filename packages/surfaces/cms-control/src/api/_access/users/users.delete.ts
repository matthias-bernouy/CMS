import type { ControlCms } from "cms-control/ControlCms";
import MissingParam from "cms-control/core/admin/http/errors/MissingParam";
import InvalidParam from "cms-control/core/admin/http/errors/InvalidParam";
import { deleteUserCompletely } from "@bernouy/cms-auth";

/** DELETE /api/users?sub= — removes a member across the membership,
 * local-credential, PAT, and dashboard-assignment stores. */
export default async function deleteUser(req: Request, cms: ControlCms) {
    const sub = new URL(req.url).searchParams.get("sub");
    if (!sub) {
        throw new MissingParam("sub");
    }

    const user = await cms.users.getBySub(sub);
    if (!user) {
        throw new InvalidParam("sub", "unknown user");
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
