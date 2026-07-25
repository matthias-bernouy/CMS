import { describe, expect, test } from "bun:test";
import { readRepositoryRuntimeEnv } from "../src/runtimeEnv";

describe("readRepositoryRuntimeEnv", () => {
    test("provides the immutable image defaults", () => {
        expect(readRepositoryRuntimeEnv({})).toEqual({
            publicPort: 3001,
            managementPort: 3000,
            registryRoot: "/var/lib/cms-repository/registry",
            managementTokenFile: "/run/secrets/cms-repository-management-token",
            managementRateLimit: 30,
            managementRateLimitWindowSeconds: 60,
            clientAddressMode: "disabled",
            trustedProxyHops: 0,
            packageDownloadLimit: 60,
            packageDownloadWindowSeconds: 60,
            gracefulStopTimeoutMs: 10_000,
        });
    });

    test("requires separate valid listener ports", () => {
        expect(() =>
            readRepositoryRuntimeEnv({
                CMS_REPOSITORY_PUBLIC_PORT: "4100",
                CMS_REPOSITORY_MANAGEMENT_PORT: "4100",
            }),
        ).toThrow("must be distinct");
        expect(() => readRepositoryRuntimeEnv({ CMS_REPOSITORY_PUBLIC_PORT: "0" })).toThrow("between 1 and 65535");
        expect(() => readRepositoryRuntimeEnv({ CMS_REPOSITORY_MANAGEMENT_PORT: "65536" })).toThrow(
            "between 1 and 65535",
        );
    });

    test("rejects relative storage and credential paths", () => {
        expect(() => readRepositoryRuntimeEnv({ CMS_REPOSITORY_REGISTRY_ROOT: "registry" })).toThrow(
            "must be an absolute path",
        );
        expect(() => readRepositoryRuntimeEnv({ CMS_REPOSITORY_MANAGEMENT_TOKEN_FILE: "management-token" })).toThrow(
            "must be an absolute path",
        );
    });

    test("bounds management and shutdown policies", () => {
        expect(() => readRepositoryRuntimeEnv({ CMS_REPOSITORY_MANAGEMENT_RATE_LIMIT: "0" })).toThrow();
        expect(() => readRepositoryRuntimeEnv({ CMS_REPOSITORY_GRACEFUL_STOP_TIMEOUT_MS: "60001" })).toThrow();
        expect(
            readRepositoryRuntimeEnv({
                CMS_REPOSITORY_MANAGEMENT_RATE_LIMIT: "7",
                CMS_REPOSITORY_MANAGEMENT_RATE_LIMIT_WINDOW_SECONDS: "20",
                CMS_REPOSITORY_GRACEFUL_STOP_TIMEOUT_MS: "5000",
            }),
        ).toMatchObject({
            managementRateLimit: 7,
            managementRateLimitWindowSeconds: 20,
            gracefulStopTimeoutMs: 5000,
        });
    });

    test("requires explicit trusted hops and keeps disabled mode explicit", () => {
        expect(readRepositoryRuntimeEnv({})).toMatchObject({
            clientAddressMode: "disabled",
            trustedProxyHops: 0,
        });
        expect(
            readRepositoryRuntimeEnv({
                CMS_HTTP_CLIENT_ADDRESS_MODE: "trusted-proxy",
                CMS_HTTP_TRUSTED_PROXY_HOPS: "2",
                CMS_INTEGRATION_PACKAGE_DOWNLOAD_LIMIT: "120",
                CMS_INTEGRATION_PACKAGE_DOWNLOAD_WINDOW_SECONDS: "30",
            }),
        ).toMatchObject({
            clientAddressMode: "trusted-proxy",
            trustedProxyHops: 2,
            packageDownloadLimit: 120,
            packageDownloadWindowSeconds: 30,
        });
        expect(() =>
            readRepositoryRuntimeEnv({
                CMS_HTTP_CLIENT_ADDRESS_MODE: "disabled",
                CMS_HTTP_TRUSTED_PROXY_HOPS: "1",
            }),
        ).toThrow("must be 0");
    });
});
