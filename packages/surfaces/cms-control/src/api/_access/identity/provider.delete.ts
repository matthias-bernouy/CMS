import type { ControlCms } from "cms-control/ControlCms";
import { readJsonBody } from "cms-control/core/admin/http/readJsonBody";
import MissingParam from "cms-control/core/admin/http/errors/MissingParam";
import { deleteIdentityProvider } from "@bernouy/cms-auth";

/** DELETE /api/identity/provider { id } — remove a login provider. The builtin
 *  `local` provider is a singleton and cannot be removed — only toggled (see
 *  PATCH). Refuses to remove the last provider any admin could still sign in
 *  with (same invariant as the PATCH toggle). Does NOT touch users (a removed
 *  provider's users keep their `sub` + role). */
export default async function deleteProvider(req: Request, cms: ControlCms) {
    const body = await readJsonBody(req);
    if (typeof body.id !== "string" || !body.id) {
        throw new MissingParam("id");
    }

    await deleteIdentityProvider(cms, body.id);
    return new Response();
}
