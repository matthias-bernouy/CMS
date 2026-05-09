import { requireCredential } from "@bernouy/core";
import { deleteProxy } from "../../core/proxy/deleteProxy";
import { wrapAdmin } from "../../core/admin/wrapAdmin";
import type { BucketCredential } from "../../interfaces/entities/BucketCredential";

/**
 * DELETE /api/proxies?providerId=<slug>
 *
 * Frontier B — per-bucket proxy delete. The bucket is taken from the
 * broker credential. Idempotent — succeeds even if the rule is absent.
 */
export default wrapAdmin(async (req, provider) => {
    const bucketId   = requireCredential<BucketCredential>(req).bucketId;
    const providerId = new URL(req.url).searchParams.get("providerId");
    if (!providerId) throw new TypeError("Missing 'providerId' query param.");
    await deleteProxy(provider, bucketId, providerId);
    return { bucketId, providerId };
});
