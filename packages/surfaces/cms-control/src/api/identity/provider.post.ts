import type { ControlCms } from "cms-control/ControlCms";
import type { IdentityProviderKind, NewIdentityProvider } from "@bernouy/cms-auth";
import { validateProviderKind } from "@bernouy/cms-auth";
import { readJsonBody } from "cms-control/core/http/readJsonBody";
import MissingParam from "cms-control/errors/Http/MissingParam";
import InvalidParam from "cms-control/errors/Http/InvalidParam";
import { slugify } from "cms-control/core/validation/gateway/gatewayValidators";


/** POST /api/identity/provider — create a login provider (config ONLY; the
 *  clientSecret is stored separately in the SecretStore under `clientSecretRef`).
 *
 *  Only `displayName` is required. `kind` defaults to `oidc`; `id` is slugified
 *  from the name when not supplied. The form-vs-redirect distinction is derived
 *  from `kind` at read time (see `toLoginMethod`), never stored. */
export default async function createProvider(req: Request, cms: ControlCms) {
    const b = await readJsonBody(req);
    if (typeof b.displayName !== "string" || !b.displayName) throw new MissingParam("displayName");

    const kind = validateProviderKind(typeof b.kind === "string" && b.kind ? b.kind : "oidc");

    const id = typeof b.id === "string" && b.id ? slugify(b.id) : slugify(b.displayName);
    if (!id) throw new InvalidParam("displayName", "cannot derive an id");

    const str = (v: unknown): string | undefined => (typeof v === "string" && v ? v : undefined);
    const input: NewIdentityProvider = {
        id, displayName: b.displayName, kind, enabled: true,
        ...(str(b.issuer)          ? { issuer:          str(b.issuer)! }          : {}),
        ...(str(b.clientId)        ? { clientId:        str(b.clientId)! }        : {}),
        ...(str(b.clientSecretRef) ? { clientSecretRef: str(b.clientSecretRef)! } : {}),
        ...(str(b.scopes)          ? { scopes:          str(b.scopes)!.split(/[,\s]+/).filter(Boolean) } : {}),
    };

    return Response.json(await cms.identityProviders.create(input));
}
