import type { ControlCms } from "src/control/ControlCms";

/** GET /api/identity/providers — all configured login providers (non-secret
 *  config; the clientSecret lives in the SecretStore, never returned here).
 *  The admin Identity table renders the full list; the builtin `local` is
 *  flagged by its `kind`, not a separate scope. */
export default async function listProviders(_req: Request, cms: ControlCms) {
    return Response.json(await cms.identityProviders.list());
}
