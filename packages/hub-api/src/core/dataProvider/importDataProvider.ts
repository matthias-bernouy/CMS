import type { Hub } from "src/exports/Hub";
import type { DataProviderImport } from "src/interfaces/DataProviderImport";
import { HubError } from "src/core/HubError";
import { discoverEndpoints, normalizeUrl } from "./discoverEndpoints";

/** Recipe : import a new data-provider. Fetch the 4 discovery docs, persist
 *  in the imports repository, return the row. Throws `HubError` on any
 *  precondition violation (unreachable / metadoc invalid / DP refuses our
 *  CP token / duplicate). */
export async function importDataProvider(
    hub: Hub,
    input: { url: string; name?: string },
): Promise<DataProviderImport> {
    const url = normalizeUrl(input.url);

    // Fresh-mint per CP call (no cache) — discoverEndpoints makes 2
    // CP-gated fetches and the SDK rejects token replay (JTI seen).
    const r = await discoverEndpoints({
        url, fetch: hub.config.fetch,
        mintCp: (providerId) => hub.issuer.mint({ aud: providerId }),
    });

    // Refuse duplicates (the repo will too, but a clean message here is nicer).
    if (await hub.imports.getByProviderId(r.providerId)) {
        throw new HubError("duplicate_provider_id",
            `providerId "${r.providerId}" already imported`);
    }
    if (await hub.imports.getByUrl(url)) {
        throw new HubError("duplicate_provider_id",
            `URL ${url} already imported under a different providerId`);
    }

    const now = new Date();
    const doc: DataProviderImport = {
        providerId: r.providerId,
        url,
        ...(input.name        !== undefined ? { name: input.name }                : {}),
        ...(r.providerKind    !== undefined ? { providerKind: r.providerKind }    : {}),
        iss:        r.iss,
        importedAt: now,
        cachedAt:   now,
        schemas:    r.schemas,
    };
    return hub.imports.insert(doc);
}
