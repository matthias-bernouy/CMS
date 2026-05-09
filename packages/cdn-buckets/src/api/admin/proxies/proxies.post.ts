import { upsertProxy } from "../../../core/proxy/upsertProxy";
import { wrapAdmin } from "../../../core/admin/wrapAdmin";
import { parseProxyAuth } from "../../../core/proxy/parseProxyAuth";

/**
 * POST /admin/api/proxies?bucketId=<id>
 *
 * Body: { providerId, server, auth }
 *   - `providerId` — slug, used as the path segment in /.cms/data/<providerId>/*
 *   - `server`     — upstream URL (http(s), no userinfo / query / fragment)
 *   - `auth`       — { type: 'none' } | { type: 'bearer', token } | { type: 'headers', headers: [...] }
 *
 * Idempotent — same `(bucketId, providerId)` always replaces. The body
 * is stored encrypted (KEK/DEK) by `MongoBucketProxyRepository` before
 * landing in Mongo. `aliasesServers.conf` is regenerated and pushed to
 * every edge via lsync; the actual secret travels separately via the
 * /edge-api/secrets manifest.
 *
 * Cross-bucket override surface — superadmin tooling. Per-tenant CMSes
 * write through the broker variant (`POST /api/proxies`) using their
 * own `bucketCredential`.
 */
export default wrapAdmin(async (req, provider) => {
    const bucketId = new URL(req.url).searchParams.get("bucketId");
    if (!bucketId) throw new TypeError("Missing 'bucketId' query param.");

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
