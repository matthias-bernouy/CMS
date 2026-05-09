import type { StorageProvider } from "../../exports/StorageProvider";
import type { BucketProxy } from "../../interfaces/entities/BucketProxy";
import { regenerateAliases } from "./regenerateAliases";
import { reload } from "./reload";

/**
 * Single entry point for every alias OR proxy mutation. Skips the whole
 * nginx round-trip if `config.nginx` is unset or alias paths aren't
 * configured — lets the provider boot for tests without aliases wired.
 *
 * Proxies live inside alias `server { }` blocks (a proxy on a bucket
 * without an alias has no public host to serve from), so a proxy mutation
 * regenerates the same `aliasesServers.conf`. Decryption of `auth` happens
 * here via `bucketProxyRepo.listAll()` — secret values are kept in memory
 * just long enough to be substituted into placeholder names.
 */
export async function applyAliasChanges(provider: StorageProvider): Promise<void> {
    const cfg = provider.config.nginx;
    if (!cfg || !cfg.aliasesPath || !cfg.aliasesServersPath || !cfg.bucketServingIncludePath) return;
    const aliases = await provider.aliasRepo.list();
    const proxies = await provider.bucketProxyRepo.listAll();
    await regenerateAliases(
        aliases,
        groupByBucket(proxies),
        cfg.aliasesPath,
        cfg.aliasesServersPath,
        cfg.bucketServingIncludePath,
        cfg.aliasCertPath,
    );
    await reload(cfg.binary);
}

function groupByBucket(proxies: BucketProxy[]): Map<string, BucketProxy[]> {
    const map = new Map<string, BucketProxy[]>();
    for (const p of proxies) {
        const arr = map.get(p.bucketId) ?? [];
        arr.push(p);
        map.set(p.bucketId, arr);
    }
    return map;
}
