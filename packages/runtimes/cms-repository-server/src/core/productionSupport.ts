import type { PublicPackageDownloadProtection, PublicPackageReadObservation } from "@bernouy/cms-repository";
import { InMemoryRateLimiter } from "@bernouy/rate-limiter";
import { createConsoleRepositoryOperationLogSink, RepositoryOperationalTelemetry } from "./observability/telemetry";
import type { RepositoryRuntimeEnv } from "../runtimeEnv";

export function productionPackageDownloadProtection(
    env: RepositoryRuntimeEnv,
    observe?: (observation: PublicPackageReadObservation) => void,
): PublicPackageDownloadProtection {
    if (env.clientAddressMode === "disabled") {
        return { clientAddressPolicy: { mode: "disabled" }, ...(observe ? { observe } : {}) };
    }
    const clientAddressPolicy =
        env.clientAddressMode === "trusted-proxy"
            ? ({ mode: "trusted-proxy", trustedProxyHops: env.trustedProxyHops } as const)
            : ({ mode: "direct" } as const);
    return {
        clientAddressPolicy,
        rateLimiter: new InMemoryRateLimiter({
            limit: env.packageDownloadLimit,
            windowSeconds: env.packageDownloadWindowSeconds,
        }),
        ...(observe ? { observe } : {}),
    };
}

export function createProductionRepositoryOperationalTelemetry(
    write?: (line: string) => void,
): RepositoryOperationalTelemetry {
    return new RepositoryOperationalTelemetry({
        log: createConsoleRepositoryOperationLogSink(write),
    });
}
