import type { IntegrationPackageSource } from "@bernouy/cms-integration-packages";
import type { IntegrationDefinitionRepository } from "@bernouy/cms-integrations";
import type { ClientAddressPolicy } from "@bernouy/http-runner";
import type {
    PublicPackageDownloadProtection,
    RepositoryProjectedCompatibilityReader,
    RepositoryProjectedReleaseReader,
    RepositoryVerificationBundleReader,
} from "@bernouy/cms-repository";
import type { RuntimeEnv } from "../../runtimeEnv";
import type { ProductionIntegrationServices } from "../integrations";
import type { CoreStores } from "../stores/core";

type RepositoryReadEnv = Pick<RuntimeEnv, "CMS_HTTP_CLIENT_ADDRESS_MODE" | "CMS_HTTP_TRUSTED_PROXY_HOPS">;

export function productionRepositoryReadConfig(
    env: RepositoryReadEnv,
    integrations: Pick<
        ProductionIntegrationServices,
        | "integrationCatalog"
        | "integrationPackageSource"
        | "publicRepositoryCompatibility"
        | "publicRepositoryReleases"
        | "publicRepositoryVerificationBundles"
    >,
    core: Pick<CoreStores, "repositoryPackageDownloadRateLimit">,
    report: (message: string) => void,
): {
    integrationCatalog: IntegrationDefinitionRepository;
    integrationPackages: IntegrationPackageSource;
    integrationProjectedCompatibility?: RepositoryProjectedCompatibilityReader;
    integrationProjectedReleases?: RepositoryProjectedReleaseReader;
    integrationVerificationBundles?: RepositoryVerificationBundleReader;
    packageDownloadProtection: PublicPackageDownloadProtection;
} {
    const clientAddressPolicy = policyFromEnv(env);
    const repository = {
        integrationCatalog: integrations.integrationCatalog,
        integrationPackages: integrations.integrationPackageSource,
        integrationProjectedCompatibility: integrations.publicRepositoryCompatibility,
        integrationProjectedReleases: integrations.publicRepositoryReleases,
        integrationVerificationBundles: integrations.publicRepositoryVerificationBundles,
    };
    if (clientAddressPolicy.mode === "disabled") {
        report(JSON.stringify({ level: "warn", event: "repository.package_download_limiter_disabled" }));
        return {
            ...repository,
            packageDownloadProtection: { clientAddressPolicy },
        };
    }
    if (!core.repositoryPackageDownloadRateLimit) {
        throw new Error("Repository package download protection requires an initialized rate limiter");
    }
    return {
        ...repository,
        packageDownloadProtection: { clientAddressPolicy, rateLimiter: core.repositoryPackageDownloadRateLimit },
    };
}

function policyFromEnv(env: RepositoryReadEnv): ClientAddressPolicy {
    if (env.CMS_HTTP_CLIENT_ADDRESS_MODE === "trusted-proxy") {
        return { mode: "trusted-proxy", trustedProxyHops: env.CMS_HTTP_TRUSTED_PROXY_HOPS };
    }
    return { mode: env.CMS_HTTP_CLIENT_ADDRESS_MODE };
}
