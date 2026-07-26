import { createHash, timingSafeEqual } from "node:crypto";
import type { Middleware } from "@bernouy/http-runner";
import type { RateLimiter } from "@bernouy/rate-limiter";
import {
    managementProtectionUnavailable,
    managementRateLimited,
    managementUnauthorized,
} from "cms-repository-management/managementResponses";

const DEFAULT_RATE_LIMIT_KEY_PREFIX = "repository-management:";
const DEFAULT_MAINTENANCE_RATE_LIMIT_KEY_PREFIX = "repository-maintenance:";
const BEARER_PATTERN = /^Bearer ([^\s]+)$/i;

export type RepositoryManagementGuardConfig = {
    serviceToken: string;
    servicePrincipal: string;
    rateLimiter: RateLimiter;
    rateLimitKeyPrefix?: string;
};

export function createRepositoryManagementGuard(config: RepositoryManagementGuardConfig): Middleware {
    return createRepositoryCapabilityGuard(config, DEFAULT_RATE_LIMIT_KEY_PREFIX);
}

export function createRepositoryMaintenanceGuard(config: RepositoryManagementGuardConfig): Middleware {
    return createRepositoryCapabilityGuard(config, DEFAULT_MAINTENANCE_RATE_LIMIT_KEY_PREFIX);
}

function createRepositoryCapabilityGuard(
    config: RepositoryManagementGuardConfig,
    defaultRateLimitKeyPrefix: string,
): Middleware {
    assertConfig(config);
    const expectedTokenDigest = digest(config.serviceToken);
    const rateLimitKey = `${config.rateLimitKeyPrefix ?? defaultRateLimitKeyPrefix}${config.servicePrincipal}`;

    return async (request, next) => {
        const suppliedToken = readBearerToken(request);
        if (!suppliedToken || !timingSafeEqual(expectedTokenDigest, digest(suppliedToken))) {
            return managementUnauthorized();
        }

        try {
            const result = await config.rateLimiter.hit(rateLimitKey);
            if (!result.allowed) {
                return managementRateLimited(result.retryAfterSeconds ?? 1);
            }
        } catch {
            return managementProtectionUnavailable();
        }
        return next();
    };
}

function assertConfig(config: RepositoryManagementGuardConfig): void {
    if (typeof config.serviceToken !== "string" || !config.serviceToken || /\s/.test(config.serviceToken)) {
        throw new TypeError("Repository management service token must be a non-empty Bearer token");
    }
    if (typeof config.servicePrincipal !== "string" || !config.servicePrincipal.trim()) {
        throw new TypeError("Repository management service principal must not be empty");
    }
    if (!config.rateLimiter || typeof config.rateLimiter.hit !== "function") {
        throw new TypeError("Repository management rate limiter is required");
    }
    if (config.rateLimitKeyPrefix !== undefined && !config.rateLimitKeyPrefix) {
        throw new TypeError("Repository management rate-limit key prefix must not be empty");
    }
}

function readBearerToken(request: Request): string | null {
    const authorization = request.headers.get("authorization");
    return authorization ? (BEARER_PATTERN.exec(authorization)?.[1] ?? null) : null;
}

function digest(value: string): Uint8Array {
    return createHash("sha256").update(value, "utf8").digest();
}
