import type { StorageProvider } from "../../exports/StorageProvider";
import type { Bucket } from "../../interfaces/entities/Bucket";
import { assertValidBucketId } from "../validation/bucket/id";

export async function getBucket(provider: StorageProvider, id: string): Promise<Bucket | null> {
    assertValidBucketId(id);
    return provider.bucketRepo.get(id);
}
