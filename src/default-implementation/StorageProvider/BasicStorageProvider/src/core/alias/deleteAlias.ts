import type { StorageProvider } from "../../exports/StorageProvider";
import { applyAliasChanges } from "../nginx/applyAliasChanges";

export async function deleteAlias(provider: StorageProvider, domain: string): Promise<{ domain: string }> {
    const lower = domain.toLowerCase();
    const existing = await provider.aliasRepo.getByDomain(lower);
    if (!existing) throw new Error(`Alias "${lower}" not found.`);
    await provider.aliasRepo.delete(lower);
    await applyAliasChanges(provider);
    return { domain: lower };
}
