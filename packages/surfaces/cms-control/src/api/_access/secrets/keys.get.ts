import type { ControlCms } from "cms-control/ControlCms";
import { listSecretKeys } from "cms-control/core/management/secrets/listSecrets";

/**
 * Lists every secret key without exposing values. Safe surface for the
 * editor / data-provider configuration UIs that need to populate dropdowns
 * of available `${KEY}` references.
 */
export default async function getSecretKeysEndpoint(_req: Request, cms: ControlCms) {
    const keys = await listSecretKeys(cms);
    return new Response(JSON.stringify(keys), {
        headers: { "Content-Type": "application/json" },
    });
}
