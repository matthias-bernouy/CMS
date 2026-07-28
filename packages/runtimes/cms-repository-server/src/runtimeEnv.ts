import { isAbsolute, resolve } from "node:path";
import {
    parsePinnedVerificationRunnerIdentity,
    type PinnedVerificationRunnerIdentity,
} from "@bernouy/cms-integration-verification";
import { readRepositoryCandidateRuntimeConfig, type RepositoryCandidateRuntimeConfig } from "./core/candidates/config";

export type RepositoryRuntimeEnvSource = Record<string, string | undefined>;

export type RepositoryRuntimeEnv = Readonly<{
    publicPort: number;
    managementPort: number;
    registryRoot: string;
    managementTokenFile: string;
    maintenanceTokenFile: string;
    workerTokenFile: string;
    workerCapabilityKeyFile: string;
    managementRateLimit: number;
    managementRateLimitWindowSeconds: number;
    workerRateLimit: number;
    workerRateLimitWindowSeconds: number;
    verifierRunner: PinnedVerificationRunnerIdentity;
    clientAddressMode: "direct" | "disabled" | "trusted-proxy";
    trustedProxyHops: number;
    packageDownloadLimit: number;
    packageDownloadWindowSeconds: number;
    gracefulStopTimeoutMs: number;
}> &
    RepositoryCandidateRuntimeConfig;

export function readRepositoryRuntimeEnv(source: RepositoryRuntimeEnvSource): RepositoryRuntimeEnv {
    const publicPort = parsePort(source.CMS_REPOSITORY_PUBLIC_PORT, "CMS_REPOSITORY_PUBLIC_PORT", 3001);
    const managementPort = parsePort(source.CMS_REPOSITORY_MANAGEMENT_PORT, "CMS_REPOSITORY_MANAGEMENT_PORT", 3000);
    if (publicPort === managementPort) {
        throw new Error("CMS_REPOSITORY_PUBLIC_PORT and CMS_REPOSITORY_MANAGEMENT_PORT must be distinct");
    }
    const clientAddress = readClientAddressPolicy(source);
    return Object.freeze({
        publicPort,
        managementPort,
        registryRoot: absolutePath(
            source.CMS_REPOSITORY_REGISTRY_ROOT ?? "/var/lib/cms-repository/registry",
            "CMS_REPOSITORY_REGISTRY_ROOT",
        ),
        managementTokenFile: absolutePath(
            source.CMS_REPOSITORY_MANAGEMENT_TOKEN_FILE ?? "/run/secrets/cms-repository-management-token",
            "CMS_REPOSITORY_MANAGEMENT_TOKEN_FILE",
        ),
        maintenanceTokenFile: absolutePath(
            source.CMS_REPOSITORY_MAINTENANCE_TOKEN_FILE ?? "/run/secrets/cms-repository-maintenance-token",
            "CMS_REPOSITORY_MAINTENANCE_TOKEN_FILE",
        ),
        workerTokenFile: absolutePath(
            source.CMS_REPOSITORY_WORKER_TOKEN_FILE ?? "/run/secrets/cms-repository-worker-token",
            "CMS_REPOSITORY_WORKER_TOKEN_FILE",
        ),
        workerCapabilityKeyFile: absolutePath(
            source.CMS_REPOSITORY_WORKER_CAPABILITY_KEY_FILE ?? "/run/secrets/cms-repository-worker-capability-key",
            "CMS_REPOSITORY_WORKER_CAPABILITY_KEY_FILE",
        ),
        managementRateLimit: positiveInteger(
            source.CMS_REPOSITORY_MANAGEMENT_RATE_LIMIT,
            "CMS_REPOSITORY_MANAGEMENT_RATE_LIMIT",
            30,
        ),
        managementRateLimitWindowSeconds: positiveInteger(
            source.CMS_REPOSITORY_MANAGEMENT_RATE_LIMIT_WINDOW_SECONDS,
            "CMS_REPOSITORY_MANAGEMENT_RATE_LIMIT_WINDOW_SECONDS",
            60,
        ),
        workerRateLimit: positiveInteger(
            source.CMS_REPOSITORY_WORKER_RATE_LIMIT,
            "CMS_REPOSITORY_WORKER_RATE_LIMIT",
            120,
        ),
        workerRateLimitWindowSeconds: positiveInteger(
            source.CMS_REPOSITORY_WORKER_RATE_LIMIT_WINDOW_SECONDS,
            "CMS_REPOSITORY_WORKER_RATE_LIMIT_WINDOW_SECONDS",
            60,
        ),
        ...readRepositoryCandidateRuntimeConfig(source),
        verifierRunner: readVerifierRunner(source),
        ...clientAddress,
        packageDownloadLimit: positiveInteger(
            source.CMS_INTEGRATION_PACKAGE_DOWNLOAD_LIMIT,
            "CMS_INTEGRATION_PACKAGE_DOWNLOAD_LIMIT",
            60,
        ),
        packageDownloadWindowSeconds: positiveInteger(
            source.CMS_INTEGRATION_PACKAGE_DOWNLOAD_WINDOW_SECONDS,
            "CMS_INTEGRATION_PACKAGE_DOWNLOAD_WINDOW_SECONDS",
            60,
        ),
        gracefulStopTimeoutMs: boundedInteger(
            source.CMS_REPOSITORY_GRACEFUL_STOP_TIMEOUT_MS,
            "CMS_REPOSITORY_GRACEFUL_STOP_TIMEOUT_MS",
            10_000,
            1,
            60_000,
        ),
    });
}

function readVerifierRunner(source: RepositoryRuntimeEnvSource): PinnedVerificationRunnerIdentity {
    return parsePinnedVerificationRunnerIdentity({
        name: source.CMS_INTEGRATION_VERIFIER_RUNNER_NAME ?? "cms-postgres",
        version: source.CMS_INTEGRATION_VERIFIER_RUNNER_VERSION ?? "1.2.0",
        imageDigest:
            source.CMS_INTEGRATION_VERIFIER_RUNNER_IMAGE_DIGEST ??
            "sha256:5acc90a93e91ff07bf72aa90a7c9f0fa189765aec90b47bdbf2152d2196383c0",
    });
}

function readClientAddressPolicy(
    source: RepositoryRuntimeEnvSource,
): Pick<RepositoryRuntimeEnv, "clientAddressMode" | "trustedProxyHops"> {
    const clientAddressMode = source.CMS_HTTP_CLIENT_ADDRESS_MODE?.trim() || "disabled";
    if (clientAddressMode !== "disabled" && clientAddressMode !== "direct" && clientAddressMode !== "trusted-proxy") {
        throw new Error("CMS_HTTP_CLIENT_ADDRESS_MODE must be disabled, direct, or trusted-proxy");
    }
    if (clientAddressMode === "trusted-proxy") {
        return {
            clientAddressMode,
            trustedProxyHops: positiveInteger(source.CMS_HTTP_TRUSTED_PROXY_HOPS, "CMS_HTTP_TRUSTED_PROXY_HOPS", 1),
        };
    }
    const trustedProxyHops = boundedInteger(
        source.CMS_HTTP_TRUSTED_PROXY_HOPS,
        "CMS_HTTP_TRUSTED_PROXY_HOPS",
        0,
        0,
        Number.MAX_SAFE_INTEGER,
    );
    if (trustedProxyHops !== 0) {
        throw new Error(`CMS_HTTP_TRUSTED_PROXY_HOPS must be 0 when client-address mode is ${clientAddressMode}`);
    }
    return { clientAddressMode, trustedProxyHops };
}

function parsePort(raw: string | undefined, name: string, fallback: number): number {
    return boundedInteger(raw, name, fallback, 1, 65_535);
}

function positiveInteger(raw: string | undefined, name: string, fallback: number): number {
    return boundedInteger(raw, name, fallback, 1, Number.MAX_SAFE_INTEGER);
}

function boundedInteger(raw: string | undefined, name: string, fallback: number, minimum: number, maximum: number) {
    if (raw === undefined) {
        return fallback;
    }
    if (!/^[0-9]+$/.test(raw)) {
        throw new Error(`${name} must be an integer between ${minimum} and ${maximum}`);
    }
    const value = Number(raw);
    if (!Number.isSafeInteger(value) || value < minimum || value > maximum) {
        throw new Error(`${name} must be an integer between ${minimum} and ${maximum}`);
    }
    return value;
}

function absolutePath(raw: string, name: string): string {
    const value = raw.trim();
    if (!value || !isAbsolute(value)) {
        throw new Error(`${name} must be an absolute path`);
    }
    return resolve(value);
}
