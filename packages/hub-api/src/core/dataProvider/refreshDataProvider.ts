import type { Hub } from "src/exports/Hub";
import type { DataProviderImport } from "src/interfaces/DataProviderImport";
import { HubError } from "src/core/HubError";
import { discoverEndpoints } from "./discoverEndpoints";

/** Recipe : refresh the 4 cached discovery docs of an imported DP. */
export async function refreshDataProvider(
    hub: Hub,
    providerId: string,
): Promise<DataProviderImport> {
    const existing = await hub.imports.getByProviderId(providerId);
    if (!existing) {
        throw new HubError("provider_not_found",
            `data-provider "${providerId}" is not imported`);
    }
    // Fresh-mint per CP call — JTI replay protection. See discoverEndpoints.
    const r = await discoverEndpoints({
        url: existing.url, fetch: hub.config.fetch,
        mintCp: (providerId) => hub.issuer.mint({ aud: providerId }),
    });
    const updated = await hub.imports.updateSchemas(providerId, r.schemas, new Date());
    if (!updated) {
        throw new HubError("provider_not_found",
            `data-provider "${providerId}" vanished mid-refresh`);
    }
    return updated;
}
