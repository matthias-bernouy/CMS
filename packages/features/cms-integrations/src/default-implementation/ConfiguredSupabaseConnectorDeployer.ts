import type { SecretReader } from "@bernouy/cms-secrets";
import { IntegrationRuntimeError } from "../core/errors";
import type {
    IntegrationConnectorDeployer,
    IntegrationConnectorDeployContext,
    IntegrationConnectorDeployment,
    IntegrationConnectorDeployResult,
} from "../interfaces/IntegrationConnectorDeployer";
import {
    SUPABASE_CONNECTOR_ACCESS_TOKEN_SECRET_KEY,
    type IntegrationConnectorProviderRepository,
} from "../interfaces/IntegrationConnectorProvider";
import {
    SupabaseConnectorDeployer,
    type SupabaseConnectorFunctionSecrets,
} from "./SupabaseConnectorDeployer";

export type ConfiguredSupabaseConnectorDeployerConfig = {
    integrationsRoot: string;
    providerRepository: IntegrationConnectorProviderRepository;
    secrets: SecretReader;
    apiBaseUrl?: string;
    fetch?: typeof fetch;
    functionSecrets?: SupabaseConnectorFunctionSecrets;
};

/**
 * Supabase deployer backed by CMS-managed provider settings and secrets.
 * Configuration is resolved for every deployment so admin changes take effect
 * without recreating the runtime or this deployer.
 */
export class ConfiguredSupabaseConnectorDeployer implements IntegrationConnectorDeployer {
    readonly provider = "supabase";

    constructor(private readonly config: ConfiguredSupabaseConnectorDeployerConfig) {}

    async deploy(
        deployment: IntegrationConnectorDeployment,
        context: IntegrationConnectorDeployContext,
    ): Promise<IntegrationConnectorDeployResult> {
        if (deployment.provider !== this.provider) {
            throw new IntegrationRuntimeError(`Supabase deployer cannot deploy provider "${deployment.provider}"`);
        }

        const configuredProvider = await this.config.providerRepository.get(this.provider);
        if (!configuredProvider) {
            throw new IntegrationRuntimeError("Supabase connector provider is not configured");
        }
        if (!configuredProvider.enabled) {
            throw new IntegrationRuntimeError("Supabase connector provider is disabled");
        }

        const projectRef = configuredProvider.projectRef.trim();
        if (!projectRef) {
            throw new IntegrationRuntimeError("Supabase connector provider project reference is not configured");
        }

        const accessToken = await this.readAccessToken();
        const deployer = new SupabaseConnectorDeployer({
            integrationsRoot: this.config.integrationsRoot,
            projectRef,
            accessToken,
            ...(this.config.apiBaseUrl !== undefined ? { apiBaseUrl: this.config.apiBaseUrl } : {}),
            ...(this.config.fetch !== undefined ? { fetch: this.config.fetch } : {}),
            ...(this.config.functionSecrets !== undefined ? { functionSecrets: this.config.functionSecrets } : {}),
        });

        try {
            return await deployer.deploy(deployment, context);
        } catch (error) {
            throw redactAccessToken(error, accessToken);
        }
    }

    private async readAccessToken(): Promise<string> {
        let stored: string | null;
        try {
            stored = await this.config.secrets.get(SUPABASE_CONNECTOR_ACCESS_TOKEN_SECRET_KEY);
        } catch {
            throw new IntegrationRuntimeError("Supabase connector provider access token could not be read");
        }
        const accessToken = stored?.trim() ?? "";
        if (!accessToken) {
            throw new IntegrationRuntimeError("Supabase connector provider access token is not configured");
        }
        return accessToken;
    }
}

function redactAccessToken(error: unknown, accessToken: string): unknown {
    if (error instanceof Error) {
        if (!error.message.includes(accessToken)) return error;
        const message = error.message.replaceAll(accessToken, "[redacted]");
        const status = error instanceof IntegrationRuntimeError ? error.status : 500;
        return new IntegrationRuntimeError(message, status);
    }
    if (typeof error === "string") {
        return new IntegrationRuntimeError(error.replaceAll(accessToken, "[redacted]"));
    }
    return error;
}
