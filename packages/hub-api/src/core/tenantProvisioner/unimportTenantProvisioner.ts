import type { Hub } from "src/exports/Hub";
import { HubError } from "src/core/HubError";

/** Recipe : unimport (forget) a tenant-provisioner. Does NOT touch the TP's own
 *  tenant data — that's a separate explicit step. The TP is just removed
 *  from the hub's local meta-registry. */
export async function unimportTenantProvisioner(hub: Hub, providerId: string): Promise<void> {
    const removed = await hub.imports.remove(providerId);
    if (!removed) {
        throw new HubError("provider_not_found",
            `tenant-provisioner "${providerId}" is not imported`);
    }
}
