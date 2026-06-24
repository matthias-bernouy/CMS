import type { ControlCms } from "cms-control/ControlCms";
import { readJsonBody } from "cms-control/core/http/readJsonBody";
import MissingParam from "cms-control/errors/Http/MissingParam";
import { markUserEmailVerified } from "cms-control/core/users/authActions";

/** POST /api/users/email-verified { sub } - admin marks a local account's
 *  email as verified without sending mail. */
export default async function markEmailVerified(req: Request, cms: ControlCms) {
    const body = await readJsonBody(req);
    const sub = typeof body.sub === "string" ? body.sub : "";
    if (!sub) throw new MissingParam("sub");
    return Response.json(await markUserEmailVerified(cms, sub));
}
