import { createHash, timingSafeEqual } from "node:crypto";
import type { Middleware } from "@bernouy/http-runner";
import type { RateLimiter } from "@bernouy/rate-limiter";
import { workerProtectionUnavailable, workerRateLimited, workerUnauthorized } from "./responses";

const BEARER_PATTERN = /^Bearer ([^\s]+)$/i;

export type RepositoryWorkerGuardConfig = Readonly<{
    serviceToken: string;
    servicePrincipal: string;
    rateLimiter: RateLimiter;
}>;

export function createRepositoryWorkerGuard(config: RepositoryWorkerGuardConfig): Middleware {
    if (typeof config.serviceToken !== "string" || !config.serviceToken || /\s/u.test(config.serviceToken)) {
        throw new TypeError("Repository worker service token must be a non-empty Bearer token");
    }
    if (typeof config.servicePrincipal !== "string" || !config.servicePrincipal.trim()) {
        throw new TypeError("Repository worker service principal must not be empty");
    }
    if (!config.rateLimiter || typeof config.rateLimiter.hit !== "function") {
        throw new TypeError("Repository worker rate limiter is required");
    }
    const expected = digest(config.serviceToken);
    const rateLimitKey = `repository-worker:${config.servicePrincipal}`;
    return async (request, next) => {
        const authorization = request.headers.get("authorization");
        const supplied = authorization ? (BEARER_PATTERN.exec(authorization)?.[1] ?? null) : null;
        if (!supplied || !timingSafeEqual(expected, digest(supplied))) {
            return workerUnauthorized();
        }
        try {
            const result = await config.rateLimiter.hit(rateLimitKey);
            if (!result.allowed) {
                return workerRateLimited(result.retryAfterSeconds ?? 1);
            }
        } catch {
            return workerProtectionUnavailable();
        }
        return next();
    };
}

export function readRepositoryWorkerCapability(request: Request): string | null {
    const authorization = request.headers.get("authorization");
    return authorization ? (BEARER_PATTERN.exec(authorization)?.[1] ?? null) : null;
}

function digest(value: string): Uint8Array {
    return createHash("sha256").update(value, "utf8").digest();
}
