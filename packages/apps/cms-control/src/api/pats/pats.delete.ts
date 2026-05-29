import type { ControlCms } from "cms-control/ControlCms";
import MissingParam from "cms-control/errors/Http/MissingParam";
import InvalidParam from "cms-control/errors/Http/InvalidParam";

/** DELETE /api/pats?id=<id> — revoke one of the CURRENT user's tokens. The id
 *  is a query param (the admin UI revokes via `<cms-confirm-form>`, which sends
 *  no body). The ownership check (list-then-match) prevents revoking another
 *  user's token. */
export default async function revokePat(req: Request, cms: ControlCms) {
    const subject = await cms.auth.getSubject(req);
    if (!subject) throw new MissingParam("session");

    const id = new URL(req.url).searchParams.get("id");
    if (!id) throw new MissingParam("id");

    const owned = await cms.pats.list(subject.identifier);
    if (!owned.some((p) => p.id === id)) throw new InvalidParam("id", "unknown token");

    await cms.pats.revoke(id);
    return new Response();
}
