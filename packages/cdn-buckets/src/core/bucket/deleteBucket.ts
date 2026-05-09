import type { StorageProvider } from "../../exports/StorageProvider";
import { assertValidBucketId } from "../validation/bucket/id";
import { applyBucketChanges } from "../nginx/applyBucketChanges";
import { applyAliasChanges } from "../nginx/applyAliasChanges";

/**
 * Deletes a bucket along with everything that hangs off it. Order of effects:
 *   1. nuke aliases pointing at the bucket (so the regenerated nginx fragments
 *      don't reference a dead bucket id),
 *   2. drop every dependent row in mongo (files, folders, credentials,
 *      pre-signed tokens, proxies — all cascade off `bucketId`),
 *   3. drop the bucket's DEK (only AFTER proxies — once it's gone, any
 *      lingering encrypted secret becomes unreadable),
 *   4. delete the bucket row,
 *   5. wipe the blob root on disk,
 *   6. regenerate nginx (cacheControls always; aliases only if any was dropped).
 *
 * Each repo bulk-delete is a single round-trip via `deleteByBucket`.
 */
export async function deleteBucket(provider: StorageProvider, id: string): Promise<void> {
    assertValidBucketId(id);
    const existing = await provider.bucketRepo.get(id);
    if (!existing) throw new Error(`Bucket "${id}" not found.`);

    const aliases = await provider.aliasRepo.listByBucket(id);
    for (const alias of aliases) await provider.aliasRepo.delete(alias.domain);

    await Promise.all([
        provider.storedFileRepo      .deleteByBucket(id),
        provider.storedFolderRepo    .deleteByBucket(id),
        provider.bucketCredentialRepo.deleteByBucket(id),
        provider.preSignedTokenRepo  .deleteByBucket(id),
        provider.bucketProxyRepo     .deleteByBucket(id),
    ]);

    await provider.bucketDekRepo.delete(id);
    await provider.bucketRepo.delete(id);
    await provider.blobStorage.deleteBucket(id);
    await applyBucketChanges(provider);
    if (aliases.length > 0) await applyAliasChanges(provider);
}
