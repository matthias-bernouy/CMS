import type { StorageProvider } from "../../exports/StorageProvider";
import type { Bucket } from "../../interfaces/entities/Bucket";
import type { BucketCreateDto } from "../validation/bucket/parseCreateDto";
import { applyBucketChanges } from "../nginx/applyBucketChanges";

export async function createBucket(provider: StorageProvider, dto: BucketCreateDto): Promise<Bucket> {
    const existing = await provider.bucketRepo.get(dto.id);
    if (existing) throw new Error(`Bucket id "${dto.id}" already taken.`);

    const now = new Date();
    const bucket: Bucket = {
        id:                   dto.id,
        createdAt:            now,
        updatedAt:            now,
        cacheControl:         dto.cacheControl,
        quotas:               dto.quotas,
        limits:               dto.limits,
        allowedUploadOrigins: dto.allowedUploadOrigins,
    };

    // Disk first: if it fails (perms, no space) we never wrote a metadata row to roll back.
    await provider.blobStorage.createBucket(bucket.id);
    try {
        await provider.bucketRepo.create(bucket);
    } catch (err) {
        await provider.blobStorage.deleteBucket(bucket.id).catch(() => {});
        throw err;
    }

    await applyBucketChanges(provider);
    return bucket;
}
