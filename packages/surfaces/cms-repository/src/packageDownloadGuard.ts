import { resolveClientAddress, type ClientAddressPolicy } from "@bernouy/http-runner";
import type { RateLimiter } from "@bernouy/rate-limiter";
import { publicRateLimited } from "cms-repository/publicReadResponse";

const DEFAULT_KEY_PREFIX = "repository-package-download:";

export type PublicPackageDownloadProtection = {
    clientAddressPolicy: ClientAddressPolicy;
    rateLimiter?: RateLimiter;
    keyPrefix?: string;
};

export function assertPackageDownloadProtection(config: PublicPackageDownloadProtection): void {
    if (config.clientAddressPolicy.mode !== "disabled" && !config.rateLimiter) {
        throw new TypeError("Active package download protection requires a rate limiter");
    }
    if (
        config.clientAddressPolicy.mode === "trusted-proxy" &&
        (!Number.isSafeInteger(config.clientAddressPolicy.trustedProxyHops) ||
            config.clientAddressPolicy.trustedProxyHops <= 0)
    ) {
        throw new TypeError("trustedProxyHops must be a positive safe integer");
    }
    if (config.keyPrefix !== undefined && !config.keyPrefix) {
        throw new TypeError("Package download rate-limit key prefix must not be empty");
    }
}

export async function guardPackageDownload(
    request: Request,
    config: PublicPackageDownloadProtection,
): Promise<Response | null> {
    const address = resolveClientAddress(request, config.clientAddressPolicy);
    if (!address) {
        return null;
    }
    let result: Awaited<ReturnType<RateLimiter["hit"]>>;
    try {
        result = await config.rateLimiter!.hit(`${config.keyPrefix ?? DEFAULT_KEY_PREFIX}${address}`);
    } catch {
        throw Object.assign(new Error("Integration package download protection is unavailable"), {
            status: 503,
            publicCode: "package_download_protection_unavailable",
        });
    }
    return result.allowed ? null : publicRateLimited(result.retryAfterSeconds ?? 1);
}
