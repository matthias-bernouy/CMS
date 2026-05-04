import type { StorageProvider } from "../../exports/StorageProvider";
import type { Bucket } from "../../interfaces/entities/Bucket";

export async function listBuckets(provider: StorageProvider): Promise<Bucket[]> {
    return provider.bucketRepo.list();
}
