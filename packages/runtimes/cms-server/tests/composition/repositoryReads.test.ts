import { describe, expect, test } from "bun:test";
import { productionRepositoryReadConfig } from "../../src/runtime/repositoryReads";

describe("production repository read composition", () => {
    test("injects the dedicated limiter with the configured trusted ingress suffix", () => {
        const fixture = dependencies();
        const config = productionRepositoryReadConfig(
            { CMS_HTTP_CLIENT_ADDRESS_MODE: "trusted-proxy", CMS_HTTP_TRUSTED_PROXY_HOPS: 2 },
            fixture.integrations,
            fixture.core,
            fixture.logs.push.bind(fixture.logs),
        );

        expect(config).toEqual({
            integrationCatalog: fixture.integrations.publicRepositoryCatalog,
            integrationPackages: fixture.integrations.publicRepositoryPackages,
            integrationProjectedCompatibility: fixture.integrations.publicRepositoryCompatibility,
            integrationProjectedReleases: fixture.integrations.publicRepositoryReleases,
            integrationVerificationBundles: fixture.integrations.publicRepositoryVerificationBundles,
            packageDownloadProtection: {
                clientAddressPolicy: { mode: "trusted-proxy", trustedProxyHops: 2 },
                rateLimiter: fixture.core.repositoryPackageDownloadRateLimit,
            },
        });
        expect(fixture.logs).toEqual([]);
    });

    test("makes disabled protection an explicit structured operational warning", () => {
        const fixture = dependencies();
        const config = productionRepositoryReadConfig(
            { CMS_HTTP_CLIENT_ADDRESS_MODE: "disabled", CMS_HTTP_TRUSTED_PROXY_HOPS: 0 },
            fixture.integrations,
            fixture.core,
            fixture.logs.push.bind(fixture.logs),
        );

        expect(config.packageDownloadProtection).toEqual({ clientAddressPolicy: { mode: "disabled" } });
        expect(fixture.logs.map((entry) => JSON.parse(entry))).toEqual([
            { level: "warn", event: "repository.package_download_limiter_disabled" },
        ]);
    });
});

function dependencies() {
    return {
        integrations: {
            publicRepositoryCatalog: { list: async () => [] },
            publicRepositoryPackages: { getPackage: async () => null },
            publicRepositoryCompatibility: { list: async () => null },
            publicRepositoryReleases: { get: async () => null },
            publicRepositoryVerificationBundles: { get: async () => null },
        },
        core: { repositoryPackageDownloadRateLimit: { hit: async () => ({ allowed: true }), reset: async () => {} } },
        logs: [] as string[],
    };
}
