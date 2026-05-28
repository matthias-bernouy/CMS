import type { ControlCms } from "cms-control/ControlCms";
import { readJsonBody } from "cms-control/core/http/readJsonBody";
import MissingParam from "cms-control/errors/Http/MissingParam";
import InvalidParam from "cms-control/errors/Http/InvalidParam";

const MIN_PASSWORD = 8;

/** POST /api/profil/password { currentPassword, newPassword } — the current
 *  user changes their own local password. Re-authenticates with the current
 *  password first (no silent takeover), and only applies to `local` accounts:
 *  OIDC/SSO users have no password here to change. */
export default async function changePassword(req: Request, cms: ControlCms) {
    const subject = await cms.auth.getSubject(req);
    if (!subject) throw new MissingParam("session");

    const user = await cms.users.getBySub(subject.identifier);
    if (!user || user.provider !== "local") {
        throw new InvalidParam("provider", "password change is only available for local accounts");
    }
    if (!user.email) throw new InvalidParam("email", "no email on file");

    const body = await readJsonBody(req);
    const currentPassword = typeof body.currentPassword === "string" ? body.currentPassword : "";
    const newPassword     = typeof body.newPassword === "string" ? body.newPassword : "";
    if (!currentPassword) throw new MissingParam("currentPassword");
    if (!newPassword)     throw new MissingParam("newPassword");
    if (newPassword.length < MIN_PASSWORD) throw new InvalidParam("newPassword", `at least ${MIN_PASSWORD} characters`);

    // Re-auth with the current password. `verify` returns the identity (raw
    // credential `sub`) we then target with `setPassword`.
    const identity = await cms.credentials.verify(user.email, currentPassword);
    if (!identity) throw new InvalidParam("currentPassword", "incorrect");

    await cms.credentials.setPassword(identity.sub, newPassword);
    return Response.json({ ok: true });
}
