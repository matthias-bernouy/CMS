import type { Hub } from "src/exports/Hub";
import { HubError } from "src/core/HubError";

/** Recipe : unimport (forget) a data-provider. Does NOT touch the DP's own
 *  tenant data — that's a separate explicit step. The DP is just removed
 *  from the hub's local meta-registry. */
export async function unimportDataProvider(hub: Hub, providerId: string): Promise<void> {
    const removed = await hub.imports.remove(providerId);
    if (!removed) {
        throw new HubError("provider_not_found",
            `data-provider "${providerId}" is not imported`);
    }
}
