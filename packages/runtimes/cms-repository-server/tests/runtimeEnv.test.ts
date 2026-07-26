import { describe, expect, test } from "bun:test";
import {
    POSTGRES_PLATFORM_VERIFICATION_SUITES_V1,
    validateReleaseAdmissionPolicySnapshot,
} from "@bernouy/cms-integration-verification";
import { productionReleaseAdmissionPolicy } from "../src/core/candidates/policy";
import { readRepositoryRuntimeEnv } from "../src/runtimeEnv";

describe("readRepositoryRuntimeEnv", () => {
    test("provides the immutable image defaults", () => {
        expect(readRepositoryRuntimeEnv({})).toEqual({
            publicPort: 3001,
            managementPort: 3000,
            registryRoot: "/var/lib/cms-repository/registry",
            managementTokenFile: "/run/secrets/cms-repository-management-token",
            maintenanceTokenFile: "/run/secrets/cms-repository-maintenance-token",
            workerTokenFile: "/run/secrets/cms-repository-worker-token",
            workerCapabilityKeyFile: "/run/secrets/cms-repository-worker-capability-key",
            managementRateLimit: 30,
            managementRateLimitWindowSeconds: 60,
            workerRateLimit: 120,
            workerRateLimitWindowSeconds: 60,
            candidateTtlMs: 86_400_000,
            workerLeaseDurationMs: 300_000,
            verifierRunner: {
                name: "cms-postgres",
                version: "1.2.0",
                imageDigest: "sha256:5acc90a93e91ff07bf72aa90a7c9f0fa189765aec90b47bdbf2152d2196383c0",
            },
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
        expect(() => readRepositoryRuntimeEnv({ CMS_REPOSITORY_MAINTENANCE_TOKEN_FILE: "maintenance-token" })).toThrow(
            "must be an absolute path",
        );
        expect(() => readRepositoryRuntimeEnv({ CMS_REPOSITORY_WORKER_TOKEN_FILE: "worker-token" })).toThrow(
            "must be an absolute path",
        );
        expect(() =>
            readRepositoryRuntimeEnv({ CMS_REPOSITORY_WORKER_CAPABILITY_KEY_FILE: "worker-capability-key" }),
        ).toThrow("must be an absolute path");
    });

    test("bounds management and shutdown policies", () => {
        expect(() => readRepositoryRuntimeEnv({ CMS_REPOSITORY_MANAGEMENT_RATE_LIMIT: "0" })).toThrow();
        expect(() => readRepositoryRuntimeEnv({ CMS_REPOSITORY_GRACEFUL_STOP_TIMEOUT_MS: "60001" })).toThrow();
        expect(() => readRepositoryRuntimeEnv({ CMS_REPOSITORY_CANDIDATE_TTL_MS: "59999" })).toThrow();
        expect(() => readRepositoryRuntimeEnv({ CMS_REPOSITORY_WORKER_LEASE_DURATION_MS: "3600001" })).toThrow();
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

    test("requires an exact digest-pinned verification runner", () => {
        expect(
            readRepositoryRuntimeEnv({
                CMS_INTEGRATION_VERIFIER_RUNNER_NAME: "cms-postgres-hardened",
                CMS_INTEGRATION_VERIFIER_RUNNER_VERSION: "2.1.0",
                CMS_INTEGRATION_VERIFIER_RUNNER_IMAGE_DIGEST: `sha256:${"a".repeat(64)}`,
            }).verifierRunner,
        ).toEqual({
            name: "cms-postgres-hardened",
            version: "2.1.0",
            imageDigest: `sha256:${"a".repeat(64)}`,
        });
        expect(() => readRepositoryRuntimeEnv({ CMS_INTEGRATION_VERIFIER_RUNNER_IMAGE_DIGEST: "latest" })).toThrow();
    });

    test("binds the production runner to every generated platform suite", async () => {
        const runner = readRepositoryRuntimeEnv({}).verifierRunner;
        const policy = await productionReleaseAdmissionPolicy(runner);

        await expect(validateReleaseAdmissionPolicySnapshot(policy)).resolves.toBeDefined();
        expect(policy.platformRequiredSuites.map((suite) => suite.suiteId)).toEqual(
            POSTGRES_PLATFORM_VERIFICATION_SUITES_V1.map((suite) => suite.suiteId),
        );
        expect(policy.platformRequiredSuites.every((suite) => suite.runner.version === "1.2.0")).toBeTrue();
        expect(policy.platformRequiredSuites.every((suite) => suite.suiteDigest.length === 64)).toBeTrue();
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
