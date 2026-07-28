import type {
    IntegrationConnectorDeployer,
    IntegrationDefinitionRepository,
    IntegrationProvisioner,
} from "@bernouy/cms-integrations";
import { FsIntegrationPackageCache } from "@bernouy/cms-integration-packages/fs";
import { HttpIntegrationPackageSource } from "@bernouy/cms-integration-packages/http";
import { FsIntegrationPackageResolver } from "@bernouy/cms-integrations/fs";
import { HttpIntegrationDefinitionRepository } from "@bernouy/cms-integrations/http";
import { ConfiguredSupabaseConnectorDeployer } from "@bernouy/cms-integrations/supabase";
import { StripeWebhookProvisioner } from "@bernouy/cms-integrations/stripe";
import type { SecretStore } from "@bernouy/cms-secrets";
import { join } from "node:path";
import { LocalFsIntegrationConnectorProviderRepository } from "../../dev-server/stores/connectorProviders";

type LocalIntegrationServiceOptions = {
    definitionFetch?: typeof fetch;
    packageFetch?: typeof fetch;
};

export const LOCAL_INTEGRATION_PACKAGE_CACHE_PATH = ".p9r/integration-packages";
export const INTEGRATION_REPOSITORY_URL_ENV = "P9R_INTEGRATION_REPOSITORY_URL";

export async function createLocalIntegrationServices(
    siteDir: string,
    repositoryUrl: string,
    secrets: SecretStore,
    options: LocalIntegrationServiceOptions = {},
) {
    const integrationConnectorProviders = new LocalFsIntegrationConnectorProviderRepository(siteDir);
    const integrationConnectorDeployers: IntegrationConnectorDeployer[] = [
        new ConfiguredSupabaseConnectorDeployer({
            providerRepository: integrationConnectorProviders,
            secrets,
            functionSecrets: readSupabaseFunctionSecrets(process.env),
        }),
    ];
    const integrationProvisioners: IntegrationProvisioner[] = [new StripeWebhookProvisioner()];
    const integrationCatalog: IntegrationDefinitionRepository = new HttpIntegrationDefinitionRepository({
        baseUrl: repositoryUrl,
        ...(options.definitionFetch ? { fetch: options.definitionFetch } : {}),
    });
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
    });
    await integrationPackageCache.init();
    return {
        integrationConnectorProviders,
        integrationConnectorDeployers,
        integrationProvisioners,
        integrationCatalog,
        integrationPackageSource,
        integrationPackageCache,
        integrationPackageResolver,
    };
}

export function readIntegrationRepositoryUrl(environment: Record<string, string | undefined>): string {
    const raw = environment[INTEGRATION_REPOSITORY_URL_ENV]?.trim();
    if (!raw) {
        throw new Error(`${INTEGRATION_REPOSITORY_URL_ENV} is required for p9r dev and p9r preview`);
    }
    let url: URL;
    try {
        url = new URL(raw);
    } catch {
        throw new Error(`${INTEGRATION_REPOSITORY_URL_ENV} must be an absolute HTTP(S) URL`);
    }
    if (
        !["http:", "https:"].includes(url.protocol) ||
        url.username ||
        url.password ||
        url.search ||
        url.hash ||
        raw.includes("?") ||
        raw.includes("#")
    ) {
        throw new Error(
            `${INTEGRATION_REPOSITORY_URL_ENV} must be an absolute HTTP(S) URL without credentials, query, or fragment`,
        );
    }
    url.pathname = url.pathname.replace(/\/+$/u, "") || "/";
    return url.href.replace(/\/$/u, "");
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
