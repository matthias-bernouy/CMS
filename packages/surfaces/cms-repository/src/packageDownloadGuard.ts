import { resolveClientAddress, type ClientAddressPolicy } from "@bernouy/http-runner";
import type { RateLimiter } from "@bernouy/rate-limiter";
import { publicRateLimited } from "cms-repository/publicReadResponse";

const DEFAULT_KEY_PREFIXES = {
    download: "repository-package-download:",
    metadata: "repository-package-metadata:",
} as const;

export type PublicPackageReadBudget = keyof typeof DEFAULT_KEY_PREFIXES;

export type PublicPackageReadObservation =
    | Readonly<{
          outcome: "served";
          resource: "package" | "release-notes";
          bytes: number;
      }>
    | Readonly<{
          outcome: "rate-limited";
          budget: PublicPackageReadBudget;
      }>;

export type PublicPackageDownloadProtection = {
    clientAddressPolicy: ClientAddressPolicy;
    rateLimiter?: RateLimiter;
    keyPrefix?: string;
    metadataKeyPrefix?: string;
    observe?: (observation: PublicPackageReadObservation) => void;
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
    if (config.metadataKeyPrefix !== undefined && !config.metadataKeyPrefix) {
        throw new TypeError("Package metadata rate-limit key prefix must not be empty");
    }
}

export async function guardPackageDownload(
    request: Request,
    config: PublicPackageDownloadProtection,
    budget: PublicPackageReadBudget = "download",
): Promise<Response | null> {
    const address = resolveClientAddress(request, config.clientAddressPolicy);
    if (!address) {
        return null;
    }
    let result: Awaited<ReturnType<RateLimiter["hit"]>>;
    try {
        const prefix =
            budget === "download"
                ? (config.keyPrefix ?? DEFAULT_KEY_PREFIXES.download)
                : (config.metadataKeyPrefix ?? DEFAULT_KEY_PREFIXES.metadata);
        result = await config.rateLimiter!.hit(`${prefix}${address}`);
    } catch {
        throw Object.assign(new Error("Integration package download protection is unavailable"), {
            status: 503,
            publicCode: "package_download_protection_unavailable",
        });
    }
    if (result.allowed) {
        return null;
    }
    observePackageRead(config, { outcome: "rate-limited", budget });
    return publicRateLimited(result.retryAfterSeconds ?? 1);
}

export function observePackageRead(
    config: PublicPackageDownloadProtection,
    observation: PublicPackageReadObservation,
): void {
    try {
        config.observe?.(observation);
    } catch {
        // Metrics must never change anonymous repository availability.
    }
}
