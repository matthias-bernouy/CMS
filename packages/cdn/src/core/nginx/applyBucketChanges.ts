import type { StorageProvider } from "../../exports/StorageProvider";
import { regenerateCacheControls } from "./regenerateCacheControls";
import { reload } from "./reload";

/**
 * Single entry point used by every bucket-mutation function. Skips the whole
 * nginx round-trip if `config.nginx` is unset, which lets the provider boot
 * for tests without an actual Nginx running.
 */
export async function applyBucketChanges(provider: StorageProvider): Promise<void> {
    const cfg = provider.config.nginx;
    if (!cfg) return;
    const allBuckets = await provider.bucketRepo.list();
    await regenerateCacheControls(allBuckets, cfg.cacheControlsPath);
    await reload(cfg.binary);
}
