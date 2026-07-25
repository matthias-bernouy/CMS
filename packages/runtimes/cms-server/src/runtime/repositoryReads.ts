import type { IntegrationPackageSource } from "@bernouy/cms-integration-packages";
import type { IntegrationDefinitionRepository } from "@bernouy/cms-integrations";
import type { ClientAddressPolicy } from "@bernouy/http-runner";
import type { PublicPackageDownloadProtection } from "@bernouy/cms-repository";
import type { RuntimeEnv } from "../runtimeEnv";
import type { ProductionIntegrationServices } from "./integrations";
import type { CoreStores } from "./stores/core";

type RepositoryReadEnv = Pick<RuntimeEnv, "CMS_HTTP_CLIENT_ADDRESS_MODE" | "CMS_HTTP_TRUSTED_PROXY_HOPS">;

export function productionRepositoryReadConfig(
    env: RepositoryReadEnv,
    integrations: Pick<ProductionIntegrationServices, "publicRepositoryCatalog" | "publicRepositoryPackages">,
    core: Pick<CoreStores, "repositoryPackageDownloadRateLimit">,
    report: (message: string) => void,
): {
    integrationCatalog: IntegrationDefinitionRepository;
    integrationPackages: IntegrationPackageSource;
    packageDownloadProtection: PublicPackageDownloadProtection;
} {
    const clientAddressPolicy = policyFromEnv(env);
    if (clientAddressPolicy.mode === "disabled") {
        report(JSON.stringify({ level: "warn", event: "repository.package_download_limiter_disabled" }));
        return {
            integrationCatalog: integrations.publicRepositoryCatalog,
            integrationPackages: integrations.publicRepositoryPackages,
            packageDownloadProtection: { clientAddressPolicy },
        };
    }
    return {
        integrationCatalog: integrations.publicRepositoryCatalog,
        integrationPackages: integrations.publicRepositoryPackages,
        packageDownloadProtection: { clientAddressPolicy, rateLimiter: core.repositoryPackageDownloadRateLimit },
    };
}

function policyFromEnv(env: RepositoryReadEnv): ClientAddressPolicy {
    if (env.CMS_HTTP_CLIENT_ADDRESS_MODE === "trusted-proxy") {
        return { mode: "trusted-proxy", trustedProxyHops: env.CMS_HTTP_TRUSTED_PROXY_HOPS };
    }
    return { mode: env.CMS_HTTP_CLIENT_ADDRESS_MODE };
}
