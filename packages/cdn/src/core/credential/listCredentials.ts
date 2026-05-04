import type { StorageProvider } from "../../exports/StorageProvider";
import type { BucketCredential } from "../../interfaces/entities/BucketCredential";

export async function listCredentials(provider: StorageProvider, bucketId: string): Promise<BucketCredential[]> {
    return provider.bucketCredentialRepo.listByBucket(bucketId);
}
