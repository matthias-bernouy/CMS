import type {
    IntegrationConnectorDeployer,
    IntegrationConnectorProviderRepository,
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

type IntegrationServiceOptions = {
    providerRepository: IntegrationConnectorProviderRepository;
    secrets: SecretStore;
    localRepositoryUrl: string;
    packageCacheDir: string;
    packageFetch?: typeof fetch;
    environment: Record<string, string | undefined>;
};

export function createProductionIntegrationServices(options: IntegrationServiceOptions) {
    const integrationRepositoryCatalog = new FsIntegrationDefinitionRepository(OFFICIAL_INTEGRATIONS_ROOT);
    const integrationRepositoryPackages = new FsIntegrationPackageSource({
        locate: (kind, version) => integrationRepositoryCatalog.locateExactVersion(kind, version),
    });
    const repositoryUrl = options.environment.P9R_INTEGRATION_REPOSITORY_URL?.trim() || options.localRepositoryUrl;
    const integrationCatalog: IntegrationDefinitionRepository = new HttpIntegrationDefinitionRepository(repositoryUrl);
    const integrationPackageSource = new HttpIntegrationPackageSource({
        baseUrl: repositoryUrl,
        ...(options.packageFetch ? { fetch: options.packageFetch } : {}),
    });
    const integrationPackageCache = new FsIntegrationPackageCache({ root: options.packageCacheDir });
    const integrationPackageResolver = new FsIntegrationPackageResolver({
        cache: integrationPackageCache,
        source: integrationPackageSource,
        embeddedSource: integrationRepositoryPackages,
    });
    const integrationConnectorDeployers: IntegrationConnectorDeployer[] = [
        new ConfiguredSupabaseConnectorDeployer({
            providerRepository: options.providerRepository,
            secrets: options.secrets,
            functionSecrets: readSupabaseFunctionSecrets(options.environment),
        }),
    ];
    const integrationProvisioners: IntegrationProvisioner[] = [new StripeWebhookProvisioner()];
    return {
        integrationRepositoryCatalog,
        integrationRepositoryPackages,
        integrationCatalog,
        integrationPackageSource,
        integrationPackageCache,
        integrationPackageResolver,
        integrationConnectorDeployers,
        integrationProvisioners,
    };
}

export type ProductionIntegrationServices = ReturnType<typeof createProductionIntegrationServices>;

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
