import type { StorageProvider } from "../../exports/StorageProvider";
import type { Bucket } from "../../interfaces/entities/Bucket";
import type { BucketUpdateDto } from "../validation/bucket/parseUpdateDto";
import { assertValidBucketId } from "../validation/bucket/id";
import { applyBucketChanges } from "../nginx/applyBucketChanges";

export async function updateBucket(
    provider: StorageProvider,
    id: string,
    dto: BucketUpdateDto,
): Promise<Bucket> {
    assertValidBucketId(id);
    const existing = await provider.bucketRepo.get(id);
    if (!existing) throw new Error(`Bucket "${id}" not found.`);

    const updatedAt = new Date();
    await provider.bucketRepo.update(id, { ...dto, updatedAt });

    if (dto.cacheControl !== undefined && dto.cacheControl !== existing.cacheControl) {
        await applyBucketChanges(provider);
    }

    return { ...existing, ...dto, updatedAt };
}
