import type { ControlCms } from "cms-control/ControlCms";
import MissingParam from "cms-control/errors/Http/MissingParam";

/** GET /api/pats — the current user's personal access tokens (no secrets).
 *  Scoped to the caller's `sub`; never lists another user's tokens. Dates are
 *  pre-formatted into display labels so the admin table stays a plain
 *  `<cms-fetch>` consumer (no client-side date formatting). */
export default async function listPats(req: Request, cms: ControlCms) {
    const subject = await cms.auth.getSubject(req);
    if (!subject) throw new MissingParam("session");

    const pats = await cms.pats.list(subject.identifier);
    return Response.json(pats.map((p) => ({
        id:            p.id,
        name:          p.name,
        createdLabel:  fmt(p.createdAt),
        lastUsedLabel: p.lastUsedAt ? fmt(p.lastUsedAt) : "Not yet",
    })));
}

function fmt(d: Date): string {
    return new Date(d).toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" });
}
