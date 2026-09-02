import { DEFAULT_INTEGRATION_PACKAGE_LIMITS } from "@bernouy/cms-integration-packages";
import type {
    IntegrationConnectorBaselineAdopter,
    IntegrationConnectorDeployer,
    IntegrationConnectorMigrationAdapter,
    IntegrationConnectorProviderRepository,
    IntegrationDefinitionRepository,
    IntegrationMigrationExternalPhaseHandler,
    IntegrationProvisioner,
} from "@bernouy/cms-integrations";
import { FsIntegrationPackageCache } from "@bernouy/cms-integration-packages/fs";
import type { IntegrationPackageCacheEvent } from "@bernouy/cms-integration-packages/fs";
import { HttpIntegrationPackageSource } from "@bernouy/cms-integration-packages/http";
import { FsIntegrationPackageResolver } from "@bernouy/cms-integrations/fs";
import { HttpIntegrationDefinitionRepository } from "@bernouy/cms-integrations/http";
import {
    ConfiguredSupabaseConnectorBaselineAdopter,
    ConfiguredSupabaseConnectorDeployer,
    ConfiguredSupabaseConnectorMigrationAdapter,
    ConfiguredSupabaseFunctionMigrationHandler,
} from "@bernouy/cms-integrations/supabase";
import { StripeWebhookProvisioner } from "@bernouy/cms-integrations/stripe";
import type { SecretStore } from "@bernouy/cms-secrets";
import { HttpRepositoryCompatibilityReader } from "../../repositoryCatalog/compatibility/reader";
import { DEFAULT_REPOSITORY_CATALOG_READER_LIMITS } from "../../repositoryCatalog/limits";
import { HttpRepositoryReleaseReader } from "../../repositoryCatalog/release/reader";
import { HttpRepositoryVerificationBundleReader } from "../../repositoryCatalog/release/bundleReader";

type IntegrationServiceOptions = {
    providerRepository: IntegrationConnectorProviderRepository;
    secrets: SecretStore;
    repository: Readonly<{ url: string }>;
    packageCacheDir: string;
    definitionFetch?: typeof fetch;
    packageFetch?: typeof fetch;
    environment: Record<string, string | undefined>;
    supabase?: Readonly<{ apiBaseUrl: string; functionsBaseUrl: string; stripeApiUrl?: string }>;
    packageCacheObserve?: (event: IntegrationPackageCacheEvent) => void;
};

export function createProductionIntegrationServices(options: IntegrationServiceOptions) {
    const repositoryUrl = options.repository.url;
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
    });
    const integrationConnectorDeployers: IntegrationConnectorDeployer[] = [
        new ConfiguredSupabaseConnectorDeployer({
            providerRepository: options.providerRepository,
            secrets: options.secrets,
            functionSecrets: readSupabaseFunctionSecrets(options.environment),
            ...(options.supabase
                ? {
                      apiBaseUrl: options.supabase.apiBaseUrl,
                      functionsBaseUrl: options.supabase.functionsBaseUrl,
                  }
                : {}),
        }),
    ];
    const supabaseMigrationConfig = {
        providerRepository: options.providerRepository,
        secrets: options.secrets,
        ...(options.supabase
            ? {
                  apiBaseUrl: options.supabase.apiBaseUrl,
                  functionsBaseUrl: options.supabase.functionsBaseUrl,
              }
            : {}),
    };
    const integrationConnectorMigrationAdapters: IntegrationConnectorMigrationAdapter[] = [
        new ConfiguredSupabaseConnectorMigrationAdapter(supabaseMigrationConfig),
    ];
    const integrationFunctionMigrationHandler: IntegrationMigrationExternalPhaseHandler =
        new ConfiguredSupabaseFunctionMigrationHandler(supabaseMigrationConfig);
    const integrationConnectorBaselineAdopters: IntegrationConnectorBaselineAdopter[] = [
        new ConfiguredSupabaseConnectorBaselineAdopter(supabaseMigrationConfig),
    ];
    const integrationProvisioners: IntegrationProvisioner[] = [
        new StripeWebhookProvisioner(
            options.supabase?.stripeApiUrl
                ? { apiBaseUrl: options.supabase.stripeApiUrl, allowInsecureLoopbackWebhooks: true }
                : {},
        ),
    ];
    const publicRepositoryCompatibility = new HttpRepositoryCompatibilityReader({
        baseUrl: repositoryUrl,
        ...(options.definitionFetch ? { fetch: options.definitionFetch } : {}),
    });
    const upgradeReleaseReader = new HttpRepositoryReleaseReader({
        baseUrl: repositoryUrl,
        ...(options.definitionFetch ? { fetch: options.definitionFetch } : {}),
        timeoutMs: 10_000,
        maxResponseBytes: DEFAULT_REPOSITORY_CATALOG_READER_LIMITS.releaseEvidenceBytes,
    });
    const publicRepositoryVerificationBundles = new HttpRepositoryVerificationBundleReader({
        baseUrl: repositoryUrl,
        ...(options.definitionFetch ? { fetch: options.definitionFetch } : {}),
        timeoutMs: 10_000,
        maxResponseBytes: DEFAULT_INTEGRATION_PACKAGE_LIMITS.maxDocumentBytes,
    });
    const integrationUpgradeReleases = {
        get: async (kind: string, version: string) =>
            (await upgradeReleaseReader.getDocument(kind, version))?.value ?? null,
    };
    return {
        repositoryUrl,
        publicRepositoryCompatibility,
        publicRepositoryReleases: upgradeReleaseReader,
        publicRepositoryVerificationBundles,
        integrationUpgradeReleases,
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
