import type { ControlCms } from "cms-control/ControlCms";
import { updateIdentityProvider, type IdentityProviderPatch } from "@bernouy/cms-auth";
import { readJsonBody } from "cms-control/core/http/readJsonBody";
import MissingParam from "cms-control/errors/Http/MissingParam";

/** PATCH /api/identity/provider { id, ...fields } — update a provider. Used by
 *  the row toggle (`{ id, enabled }`) and the edit modal. Only present fields
 *  change; `id`/`kind` are not patchable. Two guards:
 *   - the builtin provider (`local`) can only be toggled, not edited;
 *   - a provider can't be disabled if no admin could sign in afterwards. */
export default async function patchProvider(req: Request, cms: ControlCms) {
    const b = await readJsonBody(req);
    if (typeof b.id !== "string" || !b.id) throw new MissingParam("id");

    const patch: IdentityProviderPatch = {};
    if (b.enabled !== undefined)               patch.enabled = b.enabled === true || b.enabled === "true";
    if (typeof b.displayName === "string")     patch.displayName = b.displayName;
    if (typeof b.issuer === "string")          patch.issuer = b.issuer;
    if (typeof b.clientId === "string")        patch.clientId = b.clientId;
    if (typeof b.clientSecretRef === "string") patch.clientSecretRef = b.clientSecretRef;
    if (typeof b.scopes === "string")          patch.scopes = b.scopes.split(/[,\s]+/).filter(Boolean);

    return Response.json(await updateIdentityProvider(cms, b.id, patch));
}
