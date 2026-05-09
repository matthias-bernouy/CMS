import { requireCredential } from "@bernouy/core";
import { upsertProxy } from "../../core/proxy/upsertProxy";
import { wrapAdmin } from "../../core/admin/wrapAdmin";
import { parseProxyAuth } from "../../core/proxy/parseProxyAuth";
import type { BucketCredential } from "../../interfaces/entities/BucketCredential";

/**
 * POST /api/proxies
 *
 * Frontier B — per-bucket proxy upsert. The bucket is taken from the
 * broker credential, never an URL param, so a credential can only
 * configure proxies on its own bucket. Mirrors `bucket.patch.ts`.
 *
 * Body: { providerId, server, auth } — same shape as the admin variant.
 * Idempotent on `(bucketId, providerId)`.
 */
export default wrapAdmin(async (req, provider) => {
    const bucketId = requireCredential<BucketCredential>(req).bucketId;
    const body = await req.json() as Record<string, unknown>;
    if (typeof body.providerId !== "string") throw new TypeError("'providerId' must be a string.");
    if (typeof body.server     !== "string") throw new TypeError("'server' must be a string.");
    const auth = parseProxyAuth(body.auth);

    const now = new Date();
    await upsertProxy(provider, {
        bucketId,
        providerId: body.providerId,
        server:     body.server,
        auth,
        createdAt:  now,
        updatedAt:  now,
    });
    return { bucketId, providerId: body.providerId };
});
