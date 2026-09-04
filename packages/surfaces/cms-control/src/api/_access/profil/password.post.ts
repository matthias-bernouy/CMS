import type { ControlCms } from "cms-control/ControlCms";
import { changeCurrentPassword } from "cms-control/core/admin/profile";

/** POST /api/profil/password { currentPassword, newPassword } — the current
 *  user changes their own local password. Re-authenticates with the current
 *  password first (no silent takeover), and only applies to `local` accounts:
 *  OIDC/SSO users have no password here to change. */
export default async function changePassword(req: Request, cms: ControlCms) {
    await changeCurrentPassword(req, cms);
    return Response.json({ ok: true });
}
