import type { IntegrationConnectorDeployer, IntegrationDefinitionRepository } from "@bernouy/cms-integrations";
import { FsIntegrationDefinitionRepository } from "@bernouy/cms-integrations/fs";
import { HttpIntegrationDefinitionRepository } from "@bernouy/cms-integrations/http";
import { ConfiguredSupabaseConnectorDeployer } from "@bernouy/cms-integrations/supabase";
import { OFFICIAL_INTEGRATIONS_ROOT } from "@bernouy/cms-official-integrations";
import type { SecretStore } from "@bernouy/cms-secrets";
import { LocalFsIntegrationConnectorProviderRepository } from "../../dev-server/stores/connectorProviders";

export function createLocalIntegrationServices(siteDir: string, repositoryUrl: string, secrets: SecretStore) {
    const integrationConnectorProviders = new LocalFsIntegrationConnectorProviderRepository(siteDir);
    const integrationConnectorDeployers: IntegrationConnectorDeployer[] = [
        new ConfiguredSupabaseConnectorDeployer({
            integrationsRoot: OFFICIAL_INTEGRATIONS_ROOT,
            providerRepository: integrationConnectorProviders,
            secrets,
            functionSecrets: readSupabaseFunctionSecrets(process.env),
        }),
    ];
    const integrationRepositoryCatalog = new FsIntegrationDefinitionRepository(OFFICIAL_INTEGRATIONS_ROOT);
    const remoteRepositoryUrl = process.env.P9R_INTEGRATION_REPOSITORY_URL?.trim();
    const integrationCatalog: IntegrationDefinitionRepository = new HttpIntegrationDefinitionRepository(
        remoteRepositoryUrl || repositoryUrl,
    );
    return {
        integrationConnectorProviders,
        integrationConnectorDeployers,
        integrationRepositoryCatalog,
        integrationCatalog,
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
