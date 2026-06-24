import type { ControlCms } from "cms-control/ControlCms";
import { readJsonBody } from "cms-control/core/http/readJsonBody";
import MissingParam from "cms-control/errors/Http/MissingParam";
import { sendUserPasswordReset } from "cms-control/core/users/authActions";

/** POST /api/users/password-reset { sub } - admin sends a local account
 *  password-reset email. Cooldown is enforced by cms-auth. */
export default async function sendPasswordReset(req: Request, cms: ControlCms) {
    const body = await readJsonBody(req);
    const sub = typeof body.sub === "string" ? body.sub : "";
    if (!sub) throw new MissingParam("sub");
    return Response.json(await sendUserPasswordReset(cms, sub));
}
