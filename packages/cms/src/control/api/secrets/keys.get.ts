import type { ControlCms } from "src/control/ControlCms";
import { listSecretKeys } from "src/control/core/secrets/listSecrets";

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
