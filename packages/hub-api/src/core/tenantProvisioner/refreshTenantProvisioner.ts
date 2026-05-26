import type { Hub } from "src/exports/Hub";
import type { TenantProvisionerImport } from "src/interfaces/TenantProvisionerImport";
import { HubError } from "src/core/HubError";
import { discoverEndpoints } from "./discoverEndpoints";

/** Recipe : refresh the 4 cached discovery docs of an imported TP. */
export async function refreshTenantProvisioner(
    hub: Hub,
    providerId: string,
): Promise<TenantProvisionerImport> {
    const existing = await hub.imports.getByProviderId(providerId);
    if (!existing) {
        throw new HubError("provider_not_found",
            `tenant-provisioner "${providerId}" is not imported`);
    }
    // Fresh-mint per CP call — JTI replay protection. See discoverEndpoints.
    const r = await discoverEndpoints({
        url: existing.url, fetch: hub.config.fetch,
        mintCp: (providerId) => hub.issuer.mint({ aud: providerId }),
    });
    const updated = await hub.imports.updateSchemas(providerId, r.schemas, new Date());
    if (!updated) {
        throw new HubError("provider_not_found",
            `tenant-provisioner "${providerId}" vanished mid-refresh`);
    }
    return updated;
}
