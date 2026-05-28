import type { ControlCms } from "src/control/ControlCms";
import type { IdentityProviderPatch } from "src/socle/interfaces/IdentityProvider";
import { readJsonBody } from "src/control/core/http/readJsonBody";
import MissingParam from "src/control/errors/Http/MissingParam";
import InvalidParam from "src/control/errors/Http/InvalidParam";
import { assertAdminReachableAfterRemoving } from "./_adminReachability";

/** PATCH /api/identity/provider { id, ...fields } — update a provider. Used by
 *  the row toggle (`{ id, enabled }`) and the edit modal. Only present fields
 *  change; `id`/`kind` are not patchable. Two guards:
 *   - the builtin provider (`local`) can only be toggled, not edited;
 *   - a provider can't be disabled if no admin could sign in afterwards. */
export default async function patchProvider(req: Request, cms: ControlCms) {
    const b = await readJsonBody(req);
    if (typeof b.id !== "string" || !b.id) throw new MissingParam("id");

    const existing = await cms.identityProviders.get(b.id);
    if (!existing) throw new InvalidParam("id", "unknown provider");
    const builtin = existing.kind === "local";

    const patch: IdentityProviderPatch = {};
    if (b.enabled !== undefined)               patch.enabled = b.enabled === true || b.enabled === "true";
    if (typeof b.displayName === "string")     patch.displayName = b.displayName;
    if (typeof b.issuer === "string")          patch.issuer = b.issuer;
    if (typeof b.clientId === "string")        patch.clientId = b.clientId;
    if (typeof b.clientSecretRef === "string") patch.clientSecretRef = b.clientSecretRef;
    if (typeof b.scopes === "string")          patch.scopes = b.scopes.split(/[,\s]+/).filter(Boolean);

    // Builtin providers are singletons — only enable/disable, never edit fields.
    const editsFields = ["displayName", "issuer", "clientId", "clientSecretRef", "scopes"].some((k) => k in patch);
    if (builtin && editsFields) throw new InvalidParam("id", "builtin provider fields are not editable");

    // Never disable the last sign-in path for admins.
    if (patch.enabled === false && existing.enabled) {
        await assertAdminReachableAfterRemoving(cms, b.id, "enabled", "cannot disable: no admin could sign in afterwards");
    }

    const updated = await cms.identityProviders.update(b.id, patch);
    if (!updated) throw new InvalidParam("id", "unknown provider");
    return Response.json(updated);
}
