import { requireCredential } from "@bernouy/core";
import { upsertProxy } from "../../core/proxy/upsertProxy";
import { wrapAdmin } from "../../core/admin/wrapAdmin";
import { parseRulesConfig } from "../../core/proxy/rules/parseRulesConfig";
import type { BucketCredential } from "../../interfaces/entities/BucketCredential";

/**
 * POST /api/proxies
 *
 * Frontier B — per-bucket proxy upsert. The bucket is taken from the
 * broker credential, never an URL param, so a credential can only
 * configure proxies on its own bucket. Mirrors `bucket.patch.ts`.
 *
 * Body: { providerId, server, rules, secrets } — same shape as the
 * admin variant. Idempotent on `(bucketId, providerId)`.
 */
export default wrapAdmin(async (req, provider) => {
    const bucketId = requireCredential<BucketCredential>(req).bucketId;
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
