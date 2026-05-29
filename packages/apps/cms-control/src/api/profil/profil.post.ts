import type { ControlCms } from "cms-control/ControlCms";
import { readJsonBody } from "cms-control/core/http/readJsonBody";
import MissingParam from "cms-control/errors/Http/MissingParam";
import InvalidParam from "cms-control/errors/Http/InvalidParam";

/** POST /api/profil { displayName } — the current user edits their own display
 *  name. Scoped to the caller's `sub`; never touches role or another user. */
export default async function updateProfil(req: Request, cms: ControlCms) {
    const subject = await cms.auth.getSubject(req);
    if (!subject) throw new MissingParam("session");

    const body = await readJsonBody(req);
    const displayName = typeof body.displayName === "string" ? body.displayName.trim() : "";
    if (!displayName) throw new MissingParam("displayName");

    const updated = await cms.users.setProfile(subject.identifier, { displayName });
    if (!updated) throw new InvalidParam("session", "unknown user");
    return Response.json({ displayName: updated.displayName });
}
