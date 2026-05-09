import { deleteProxy } from "../../../core/proxy/deleteProxy";
import { wrapAdmin } from "../../../core/admin/wrapAdmin";

/**
 * DELETE /admin/api/proxies?bucketId=<id>&providerId=<slug>
 * Idempotent — succeeds even if the rule doesn't exist.
 */
export default wrapAdmin(async (req, provider) => {
    const params     = new URL(req.url).searchParams;
    const bucketId   = params.get("bucketId");
    const providerId = params.get("providerId");
    if (!bucketId)   throw new TypeError("Missing 'bucketId' query param.");
    if (!providerId) throw new TypeError("Missing 'providerId' query param.");
    await deleteProxy(provider, bucketId, providerId);
    return { bucketId, providerId };
});
