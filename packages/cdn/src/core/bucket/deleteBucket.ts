import type { StorageProvider } from "../../exports/StorageProvider";
import { assertValidBucketId } from "../validation/bucket/id";
import { applyBucketChanges } from "../nginx/applyBucketChanges";
import { applyAliasChanges } from "../nginx/applyAliasChanges";

export async function deleteBucket(provider: StorageProvider, id: string): Promise<void> {
    assertValidBucketId(id);
    const existing = await provider.bucketRepo.get(id);
    if (!existing) throw new Error(`Bucket "${id}" not found.`);

    // Cascade: drop aliases pointing at this bucket so we don't leave dangling
    // entries in the generated nginx fragments.
    const aliases = await provider.aliasRepo.listByBucket(id);
    for (const alias of aliases) await provider.aliasRepo.delete(alias.domain);

    await provider.bucketRepo.delete(id);
    await provider.blobStorage.deleteBucket(id);
    await applyBucketChanges(provider);
    if (aliases.length > 0) await applyAliasChanges(provider);
}
