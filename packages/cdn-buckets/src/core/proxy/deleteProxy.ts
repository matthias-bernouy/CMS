import type { StorageProvider } from "../../exports/StorageProvider";
import { assertValidBucketId } from "../validation/bucket/id";
import { assertValidProviderId } from "../validation/proxy/providerId";
import { applyProxyChanges } from "./applyProxyChanges";

/**
 * Idempotent delete. Returns whether a row was actually removed so call
 * sites can decide whether the surrounding nginx reload is justified
 * (currently we always reload — keeps the operation predictable).
 */
export async function deleteProxy(provider: StorageProvider, bucketId: string, providerId: string): Promise<void> {
    assertValidBucketId(bucketId);
    assertValidProviderId(providerId);

    await provider.bucketProxyRepo.delete(bucketId, providerId);
    await applyProxyChanges(provider);
}
