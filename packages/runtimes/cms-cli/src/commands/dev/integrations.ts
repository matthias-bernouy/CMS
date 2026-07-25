import type {
    IntegrationConnectorDeployer,
    IntegrationDefinitionRepository,
    IntegrationProvisioner,
} from "@bernouy/cms-integrations";
import { FsIntegrationPackageCache, FsIntegrationPackageSource } from "@bernouy/cms-integration-packages/fs";
import { HttpIntegrationPackageSource } from "@bernouy/cms-integration-packages/http";
import { FsIntegrationDefinitionRepository, FsIntegrationPackageResolver } from "@bernouy/cms-integrations/fs";
import { HttpIntegrationDefinitionRepository } from "@bernouy/cms-integrations/http";
import { ConfiguredSupabaseConnectorDeployer } from "@bernouy/cms-integrations/supabase";
import { StripeWebhookProvisioner } from "@bernouy/cms-integrations/stripe";
import { OFFICIAL_INTEGRATIONS_ROOT } from "@bernouy/cms-official-integrations";
import type { SecretStore } from "@bernouy/cms-secrets";
import { join } from "node:path";
import { LocalFsIntegrationConnectorProviderRepository } from "../../dev-server/stores/connectorProviders";

type LocalIntegrationServiceOptions = {
    environment?: Record<string, string | undefined>;
    packageFetch?: typeof fetch;
};

export const LOCAL_INTEGRATION_PACKAGE_CACHE_PATH = ".p9r/integration-packages";

export async function createLocalIntegrationServices(
    siteDir: string,
    localRepositoryUrl: string,
    secrets: SecretStore,
    options: LocalIntegrationServiceOptions = {},
) {
    const environment = options.environment ?? process.env;
    const integrationConnectorProviders = new LocalFsIntegrationConnectorProviderRepository(siteDir);
    const integrationConnectorDeployers: IntegrationConnectorDeployer[] = [
        new ConfiguredSupabaseConnectorDeployer({
            providerRepository: integrationConnectorProviders,
            secrets,
            functionSecrets: readSupabaseFunctionSecrets(process.env),
        }),
    ];
    const integrationRepositoryCatalog = new FsIntegrationDefinitionRepository(OFFICIAL_INTEGRATIONS_ROOT);
    const integrationRepositoryPackages = new FsIntegrationPackageSource({
        locate: (kind, version) => integrationRepositoryCatalog.locateExactVersion(kind, version),
    });
    const integrationProvisioners: IntegrationProvisioner[] = [new StripeWebhookProvisioner()];
    const repositoryUrl = environment.P9R_INTEGRATION_REPOSITORY_URL?.trim() || localRepositoryUrl;
    const integrationCatalog: IntegrationDefinitionRepository = new HttpIntegrationDefinitionRepository(repositoryUrl);
    const integrationPackageSource = new HttpIntegrationPackageSource({
        baseUrl: repositoryUrl,
        ...(options.packageFetch ? { fetch: options.packageFetch } : {}),
    });
    const integrationPackageCache = new FsIntegrationPackageCache({
        root: join(siteDir, LOCAL_INTEGRATION_PACKAGE_CACHE_PATH),
    });
    const integrationPackageResolver = new FsIntegrationPackageResolver({
        cache: integrationPackageCache,
        source: integrationPackageSource,
        embeddedSource: integrationRepositoryPackages,
    });
    await integrationPackageCache.init();
    return {
        integrationConnectorProviders,
        integrationConnectorDeployers,
        integrationProvisioners,
        integrationRepositoryCatalog,
        integrationRepositoryPackages,
        integrationCatalog,
        integrationPackageSource,
        integrationPackageCache,
        integrationPackageResolver,
    };
}

function readSupabaseFunctionSecrets(source: Record<string, string | undefined>): Record<string, string> {
    const keys = ["SMTP_HOST", "SMTP_PORT", "SMTP_SECURE", "SMTP_USER", "SMTP_PASSWORD", "SMTP_FROM", "SMTP_REPLY_TO"];
    const secrets: Record<string, string> = {};
    for (const key of keys) {
        const value = source[key]?.trim();
        if (value) {
            secrets[key] = value;
        }
    }
    return secrets;
}
