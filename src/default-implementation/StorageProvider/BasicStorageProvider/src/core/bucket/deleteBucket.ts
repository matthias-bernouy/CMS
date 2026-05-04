import type { StorageProvider } from "../../exports/StorageProvider";
import { assertValidBucketId } from "../validation/bucket/id";
import { applyBucketChanges } from "../nginx/applyBucketChanges";

export async function deleteBucket(provider: StorageProvider, id: string): Promise<void> {
    assertValidBucketId(id);
    const existing = await provider.bucketRepo.get(id);
    if (!existing) throw new Error(`Bucket "${id}" not found.`);

    await provider.bucketRepo.delete(id);
    await provider.blobStorage.deleteBucket(id);
    await applyBucketChanges(provider);
}
