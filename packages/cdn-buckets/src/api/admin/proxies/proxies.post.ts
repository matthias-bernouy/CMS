import { upsertProxy } from "../../../core/proxy/upsertProxy";
import { wrapAdmin } from "../../../core/admin/wrapAdmin";
import { parseRulesConfig } from "../../../core/proxy/rules/parseRulesConfig";

/**
 * POST /admin/api/proxies?bucketId=<id>
 *
 * Body: { providerId, server, rules, secrets }
 *   - `providerId` — slug, used as the path segment in /.cms/data/<providerId>/*
 *   - `server`     — upstream URL (http(s), no userinfo / query / fragment)
 *   - `rules`      — RulesConfig (defaults + paths). Validated by upsertProxy.
 *   - `secrets`    — { [envName]: cleartext }. Encrypted by MongoBucketProxyRepository.
 *
 * Idempotent — same `(bucketId, providerId)` always replaces. Cleartext
 * secrets travel on the wire (HTTPS), are encrypted via the bucket DEK
 * before reaching Mongo, and never written to the rendered nginx
 * fragment (read at runtime via `os.getenv` on the edge).
 */
export default wrapAdmin(async (req, provider) => {
    const bucketId = new URL(req.url).searchParams.get("bucketId");
    if (!bucketId) throw new TypeError("Missing 'bucketId' query param.");

    const body = await req.json() as Record<string, unknown>;
    if (typeof body.providerId !== "string") throw new TypeError("'providerId' must be a string.");
    if (typeof body.server     !== "string") throw new TypeError("'server' must be a string.");
    const rules   = parseRulesConfig(body.rules);
    const secrets = parseSecrets(body.secrets);

    const now = new Date();
    await upsertProxy(provider, {
        bucketId,
        providerId: body.providerId,
        server:     body.server,
        rules,
        secrets,
        createdAt:  now,
        updatedAt:  now,
    });
    return { bucketId, providerId: body.providerId };
});

function parseSecrets(value: unknown): Record<string, string> {
    if (value === undefined || value === null) return {};
    if (typeof value !== "object" || Array.isArray(value)) {
        throw new TypeError("'secrets' must be an object of { envName: cleartext }.");
    }
    const out: Record<string, string> = {};
    for (const [k, v] of Object.entries(value)) {
        if (typeof v !== "string") throw new TypeError(`'secrets["${k}"]' must be a string.`);
        out[k] = v;
    }
    return out;
}
