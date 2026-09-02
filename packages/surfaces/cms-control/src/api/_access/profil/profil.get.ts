import type { ControlCms } from "cms-control/ControlCms";
import { readCurrentProfile, type CurrentProfile } from "cms-control/core/admin/profile";

export type ProfilResponse = CurrentProfile;

/**
 * `GET /api/profil` — the current user's own profile, for the admin Profile
 * page. Identity comes from the session (`getSubject`); the editable/displayed
 * fields come from the membership store (`users.getBySub`). Falls back to the
 * subject when the membership row is absent (e.g. the dev in-memory auth, whose
 * subject id may not be a stored user).
 */
export default async function profil(req: Request, cms: ControlCms): Promise<Response> {
    const returnTo = cms.basePath || "/";
    return Response.json(await readCurrentProfile(req, cms, returnTo));
}
