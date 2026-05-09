import type { StorageProvider } from "../../exports/StorageProvider";
import type { BucketProxy } from "../../interfaces/entities/BucketProxy";
import { assertValidBucketId } from "../validation/bucket/id";
import { assertValidProviderId } from "../validation/proxy/providerId";
import { assertValidProxyServer } from "../validation/proxy/server";
import { assertValidProxyAuthValue } from "../validation/proxy/authValue";
import { assertValidProxyHeaderName } from "../validation/proxy/headerName";
import { applyProxyChanges } from "./applyProxyChanges";

/**
 * Create or update a proxy rule on a bucket. Idempotent: the same
 * `(bucketId, providerId)` pair always replaces in-place.
 *
 * Validation is upfront and total — every secret value is rejected at
 * write time if it contains characters that would break the envsubst
 * step on the edge (notably `$`). Server URL is rejected if it embeds
 * credentials, query strings, or anything else that doesn't belong in
 * a `proxy_pass` target.
 */
export async function upsertProxy(provider: StorageProvider, proxy: BucketProxy): Promise<void> {
    assertValidBucketId(proxy.bucketId);
    assertValidProviderId(proxy.providerId);
    assertValidProxyServer(proxy.server);
    validateAuth(proxy);

    const bucket = await provider.bucketRepo.get(proxy.bucketId);
    if (!bucket) throw new Error(`Bucket "${proxy.bucketId}" not found.`);

    await provider.bucketProxyRepo.upsert(proxy);
    await applyProxyChanges(provider);
}

function validateAuth(proxy: BucketProxy): void {
    if (proxy.auth.type === "none")   return;
    if (proxy.auth.type === "bearer") {
        assertValidProxyAuthValue(proxy.auth.token, "auth.token");
        return;
    }
    proxy.auth.headers.forEach((h, i) => {
        assertValidProxyHeaderName(h.name, `auth.headers[${i}].name`);
        assertValidProxyAuthValue(h.value, `auth.headers[${i}].value`);
    });
}
