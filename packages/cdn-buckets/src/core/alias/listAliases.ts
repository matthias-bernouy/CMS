import type { StorageProvider } from "../../exports/StorageProvider";
import type { Alias } from "../../interfaces/entities/Alias";

export async function listAliasesByBucket(provider: StorageProvider, bucketId: string): Promise<Alias[]> {
    return provider.aliasRepo.listByBucket(bucketId);
}
