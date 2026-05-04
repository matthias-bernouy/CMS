import type { Middleware } from "../../../../../../interfaces/Runner";
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

const bucketIdByRequest = new WeakMap<Request, string>();

function extractBearer(req: Request): string | null {
    const header = req.headers.get("authorization");
    if (!header) return null;
    const match = /^Bearer\s+(.+)$/i.exec(header.trim());
    return match ? match[1]!.trim() : null;
}

function reject(code: string, message: string, status: number): Response {
    return Response.json({ ok: false, error: { code, message } }, { status });
}
