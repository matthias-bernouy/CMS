import type { ControlCms } from "cms-control/ControlCms";
import { readJsonBody } from "cms-control/core/http/readJsonBody";
import MissingParam from "cms-control/errors/Http/MissingParam";
import { sendUserEmailVerification } from "cms-control/core/users/authActions";

/** POST /api/users/email-verification { sub } - admin resends the local
 *  account verification email. Cooldown is enforced by cms-auth. */
export default async function resendUserEmailVerification(req: Request, cms: ControlCms) {
    const body = await readJsonBody(req);
    const sub = typeof body.sub === "string" ? body.sub : "";
    if (!sub) throw new MissingParam("sub");
    return Response.json(await sendUserEmailVerification(cms, sub));
}
