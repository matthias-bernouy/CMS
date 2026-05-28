import type { ControlCms } from "cms-control/ControlCms";
import { readJsonBody } from "cms-control/core/http/readJsonBody";
import MissingParam from "cms-control/errors/Http/MissingParam";
import InvalidParam from "cms-control/errors/Http/InvalidParam";

const MAX_NAME_LENGTH = 100;

/** POST /api/pats { name } — mint a token for the current user. Returns the
 *  plaintext `token` ONCE; only its hash is stored server-side. */
export default async function createPat(req: Request, cms: ControlCms) {
    const subject = await cms.auth.getSubject(req);
    if (!subject) throw new MissingParam("session");

    const body = await readJsonBody(req);
    const name = typeof body.name === "string" ? body.name.trim() : "";
    if (!name) throw new MissingParam("name");
    if (name.length > MAX_NAME_LENGTH) throw new InvalidParam("name", `max ${MAX_NAME_LENGTH} chars`);

    const { token, pat } = await cms.pats.create({ sub: subject.identifier, name });
    return Response.json({ token, pat });
}
