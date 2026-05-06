import type { Middleware } from "@bernouy/core";
import type { BucketCredentialRepository } from "../../interfaces/repositories/BucketCredentialRepository";
import { hashToken } from "../credential/hashToken";

/**
 * Frontier B guard. Reads `Authorization: Bearer <token>`, validates against
 * `BucketCredentialRepository`, and on success stores the resolved `bucketId`
 * on a side WeakMap that handlers consume via `getBrokerBucketId(req)`.
 *
 * No CSRF check: bearer tokens are not vulnerable to CSRF the way cookie
 * sessions are — the browser does not auto-attach an `Authorization` header
 * to cross-origin requests.
 */
export function createBrokerGuard(repo: BucketCredentialRepository): Middleware {
    return async (req, next) => {
        const cleartext = extractBearer(req);
        if (!cleartext) return reject("missing_token", "Authorization: Bearer <token> required.", 401);

        const credential = await repo.getByTokenHash(await hashToken(cleartext));
        if (!credential) return reject("invalid_token", "Token is unknown.", 401);

        const now = Date.now();
        if (credential.revokedAt) return reject("invalid_token", "Token has been revoked.", 401);
        if (credential.expiresAt && credential.expiresAt.getTime() <= now) {
            return reject("invalid_token", "Token has expired.", 401);
        }

        bucketIdByRequest.set(req, credential.bucketId);
        return await next();
    };
}

/**
 * Extract the `bucketId` resolved by `createBrokerGuard` for this request.
 * Throws if called outside a guarded route — handlers must be mounted under
 * the broker group.
 */
export function getBrokerBucketId(req: Request): string {
    const id = bucketIdByRequest.get(req);
    if (!id) throw new Error("getBrokerBucketId called on a request that did not pass the broker guard.");
    return id;
}

// `serveApi` loads API handlers via runtime dynamic-import from absolute
// source paths, while the guard itself is created from the package's
// "regular" import graph. In some packaging shapes that gives us two
// distinct module instances and thus two distinct WeakMaps. Pin the map on
// `globalThis` via a registered Symbol so guard-side `set` and handler-side
// `get` always hit the same instance.
const SHARED_KEY = Symbol.for("@bernouy/cdn-buckets::brokerGuard::bucketIdByRequest");
type BucketByRequestMap = WeakMap<Request, string>;
const bucketIdByRequest: BucketByRequestMap = ((): BucketByRequestMap => {
    const g = globalThis as unknown as { [k: symbol]: BucketByRequestMap | undefined };
    return g[SHARED_KEY] ?? (g[SHARED_KEY] = new WeakMap());
})();

function extractBearer(req: Request): string | null {
    const header = req.headers.get("authorization");
    if (!header) return null;
    const match = /^Bearer\s+(.+)$/i.exec(header.trim());
    return match ? match[1]!.trim() : null;
}

function reject(code: string, message: string, status: number): Response {
    return Response.json({ ok: false, error: { code, message } }, { status });
}
