import type { ControlCms } from "cms-control/ControlCms";
import { readJsonBody } from "cms-control/core/admin/http/readJsonBody";
import MissingParam from "cms-control/core/admin/http/errors/MissingParam";
import { deleteIdentityProvider } from "@bernouy/cms-auth";

/** DELETE /api/identity/provider { id } — remove a login provider. The builtin
 *  `local` provider is a singleton and cannot be removed — only toggled (see
 *  PATCH). Refuses to remove the last provider an existing member could still
 *  use (same invariant as the PATCH toggle). Does not touch member records. */
export default async function deleteProvider(req: Request, cms: ControlCms) {
    const body = await readJsonBody(req);
    if (typeof body.id !== "string" || !body.id) {
        throw new MissingParam("id");
    }

    await deleteIdentityProvider(cms, body.id);
    return new Response();
}
