import type { ControlCms } from "src/control/ControlCms";
import type { IdentityProviderKind, NewIdentityProvider } from "@bernouy/auth-core";
import { readJsonBody } from "src/control/core/http/readJsonBody";
import MissingParam from "src/control/errors/Http/MissingParam";
import InvalidParam from "src/control/errors/Http/InvalidParam";

const KINDS: IdentityProviderKind[] = ["oidc", "local"];

/** POST /api/identity/provider — create a login provider (config ONLY; the
 *  clientSecret is stored separately in the SecretStore under `clientSecretRef`).
 *
 *  Only `displayName` is required. `kind` defaults to `oidc`; `id` is slugified
 *  from the name when not supplied. The form-vs-redirect distinction is derived
 *  from `kind` at read time (see `toLoginMethod`), never stored. */
export default async function createProvider(req: Request, cms: ControlCms) {
    const b = await readJsonBody(req);
    if (typeof b.displayName !== "string" || !b.displayName) throw new MissingParam("displayName");

    const kind = (typeof b.kind === "string" && b.kind ? b.kind : "oidc") as IdentityProviderKind;
    if (!KINDS.includes(kind)) throw new InvalidParam("kind", "oidc|local");

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

const slugify = (s: string): string =>
    s.toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
