import type {
    IntegrationConnectorBaselineAdopter,
    IntegrationConnectorDeployer,
    IntegrationConnectorMigrationAdapter,
    IntegrationConnectorProviderRepository,
    IntegrationDefinitionRepository,
    IntegrationMigrationExternalPhaseHandler,
    IntegrationProvisioner,
} from "@bernouy/cms-integrations";
import { FsIntegrationPackageCache, FsIntegrationPackageSource } from "@bernouy/cms-integration-packages/fs";
import type { IntegrationPackageCacheEvent } from "@bernouy/cms-integration-packages/fs";
import { HttpIntegrationPackageSource } from "@bernouy/cms-integration-packages/http";
import { FsIntegrationDefinitionRepository, FsIntegrationPackageResolver } from "@bernouy/cms-integrations/fs";
import { HttpIntegrationDefinitionRepository } from "@bernouy/cms-integrations/http";
import {
    ConfiguredSupabaseConnectorBaselineAdopter,
    ConfiguredSupabaseConnectorDeployer,
    ConfiguredSupabaseConnectorMigrationAdapter,
    ConfiguredSupabaseFunctionMigrationHandler,
} from "@bernouy/cms-integrations/supabase";
import { StripeWebhookProvisioner } from "@bernouy/cms-integrations/stripe";
import { OFFICIAL_INTEGRATIONS_ROOT } from "@bernouy/cms-official-integrations";
import type { SecretStore } from "@bernouy/cms-secrets";
import { HttpRepositoryCompatibilityReader } from "../repositoryCatalog/compatibility/reader";

type IntegrationServiceOptions = {
    providerRepository: IntegrationConnectorProviderRepository;
    secrets: SecretStore;
    localRepositoryUrl: string;
    packageCacheDir: string;
    definitionFetch?: typeof fetch;
    packageFetch?: typeof fetch;
    environment: Record<string, string | undefined>;
    packageCacheObserve?: (event: IntegrationPackageCacheEvent) => void;
};

export function createProductionIntegrationServices(options: IntegrationServiceOptions) {
    const integrationRepositoryCatalog = new FsIntegrationDefinitionRepository(OFFICIAL_INTEGRATIONS_ROOT);
    const integrationRepositoryPackages = new FsIntegrationPackageSource({
        locate: (kind, version) => integrationRepositoryCatalog.locateExactVersion(kind, version),
    });
    const globalRepositoryUrl = options.environment.P9R_INTEGRATION_REPOSITORY_URL?.trim();
    const repositoryReadMode = globalRepositoryUrl ? "global" : "embedded";
    const repositoryUrl = globalRepositoryUrl || options.localRepositoryUrl;
    const integrationCatalog: IntegrationDefinitionRepository = new HttpIntegrationDefinitionRepository({
        baseUrl: repositoryUrl,
        ...(options.definitionFetch ? { fetch: options.definitionFetch } : {}),
    });
    const integrationPackageSource = new HttpIntegrationPackageSource({
        baseUrl: repositoryUrl,
        ...(options.packageFetch ? { fetch: options.packageFetch } : {}),
    });
    const integrationPackageCache = new FsIntegrationPackageCache({
        root: options.packageCacheDir,
        ...(options.packageCacheObserve ? { observe: options.packageCacheObserve } : {}),
    });
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
    const supabaseMigrationConfig = {
        providerRepository: options.providerRepository,
        secrets: options.secrets,
    };
    const integrationConnectorMigrationAdapters: IntegrationConnectorMigrationAdapter[] = [
        new ConfiguredSupabaseConnectorMigrationAdapter(supabaseMigrationConfig),
    ];
    const integrationFunctionMigrationHandler: IntegrationMigrationExternalPhaseHandler =
        new ConfiguredSupabaseFunctionMigrationHandler(supabaseMigrationConfig);
    const integrationConnectorBaselineAdopters: IntegrationConnectorBaselineAdopter[] = [
        new ConfiguredSupabaseConnectorBaselineAdopter(supabaseMigrationConfig),
    ];
    const integrationProvisioners: IntegrationProvisioner[] = [new StripeWebhookProvisioner()];
    const publicRepositoryCatalog = repositoryReadMode === "global" ? integrationCatalog : integrationRepositoryCatalog;
    const publicRepositoryPackages =
        repositoryReadMode === "global" ? integrationPackageSource : integrationRepositoryPackages;
    const publicRepositoryCompatibility = globalRepositoryUrl
        ? new HttpRepositoryCompatibilityReader({
              baseUrl: globalRepositoryUrl,
              ...(options.definitionFetch ? { fetch: options.definitionFetch } : {}),
          })
        : undefined;
    return {
        repositoryReadMode,
        repositoryUrl,
        integrationRepositoryCatalog,
        integrationRepositoryPackages,
        publicRepositoryCatalog,
        publicRepositoryPackages,
        publicRepositoryCompatibility,
        integrationCatalog,
        integrationPackageSource,
        integrationPackageCache,
        integrationPackageResolver,
        integrationConnectorDeployers,
        integrationConnectorMigrationAdapters,
        integrationFunctionMigrationHandler,
        integrationConnectorBaselineAdopters,
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
