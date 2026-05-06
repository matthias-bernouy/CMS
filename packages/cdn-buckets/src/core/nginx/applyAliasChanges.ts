import type { StorageProvider } from "../../exports/StorageProvider";
import { regenerateAliases } from "./regenerateAliases";
import { reload } from "./reload";

/**
 * Single entry point for every alias mutation. Skips the whole nginx
 * round-trip if `config.nginx` is unset or alias paths aren't configured —
 * lets the provider boot for tests without aliases wired.
 */
export async function applyAliasChanges(provider: StorageProvider): Promise<void> {
    const cfg = provider.config.nginx;
    if (!cfg || !cfg.aliasesPath || !cfg.aliasesServersPath || !cfg.bucketServingIncludePath) return;
    const all = await provider.aliasRepo.list();
    await regenerateAliases(
        all,
        cfg.aliasesPath,
        cfg.aliasesServersPath,
        cfg.bucketServingIncludePath,
        cfg.aliasCertPath,
    );
    await reload(cfg.binary);
}
