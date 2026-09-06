import type { IntegrationConnectorBinding } from "../interfaces/IntegrationInstallation";
import { SupabaseManagementClient } from "./supabase/SupabaseManagementClient";
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
} from "../interfaces/IntegrationConnectorDeployer/provider";
import { SupabaseConnectorDeployer, type SupabaseConnectorFunctionSecrets } from "./supabase/SupabaseConnectorDeployer";

export type ConfiguredSupabaseConnectorDeployerConfig = {
    providerRepository: IntegrationConnectorProviderRepository;
    secrets: SecretReader;
    apiBaseUrl?: string;
    functionsBaseUrl?: string;
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

    async syncSecrets(binding: IntegrationConnectorBinding, values: Record<string, string>): Promise<void> {
        const projectRef = await this.readProjectRef();
        if (
            binding.provider !== this.provider ||
            binding.outputs.functionsBaseUrl !== this.functionsBaseUrl(projectRef)
        ) {
            throw new IntegrationRuntimeError("Installed connector does not match configured provider", 409);
        }
        const accessToken = await this.readAccessToken();
        const client = new SupabaseManagementClient({
            projectRef,
            accessToken,
            apiBaseUrl: (this.config.apiBaseUrl ?? "https://api.supabase.com").replace(/\/+$/, ""),
            fetch: this.config.fetch ?? fetch,
        });
        try {
            await client.setFunctionSecrets(Object.entries(values).map(([name, value]) => ({ name, value })));
        } catch {
            throw new IntegrationRuntimeError("Connector runtime secret synchronization failed", 502);
        }
    }

    async previewOutputs(): Promise<Record<string, string>> {
        const projectRef = await this.readProjectRef();
        return { functionsBaseUrl: this.functionsBaseUrl(projectRef) };
    }

    async deploy(
        deployment: IntegrationConnectorDeployment,
        context: IntegrationConnectorDeployContext,
    ): Promise<IntegrationConnectorDeployResult> {
        if (deployment.provider !== this.provider) {
            throw new IntegrationRuntimeError(`Supabase deployer cannot deploy provider "${deployment.provider}"`);
        }

        const projectRef = await this.readProjectRef();
        const accessToken = await this.readAccessToken();
        const deployer = new SupabaseConnectorDeployer({
            projectRef,
            accessToken,
            ...(this.config.apiBaseUrl !== undefined ? { apiBaseUrl: this.config.apiBaseUrl } : {}),
            ...(this.config.functionsBaseUrl !== undefined ? { functionsBaseUrl: this.config.functionsBaseUrl } : {}),
            ...(this.config.fetch !== undefined ? { fetch: this.config.fetch } : {}),
            ...(this.config.functionSecrets !== undefined ? { functionSecrets: this.config.functionSecrets } : {}),
        });

        try {
            return await deployer.deploy(deployment, context);
        } catch (error) {
            throw redactAccessToken(error, accessToken);
        }
    }

    private functionsBaseUrl(projectRef: string): string {
        return (this.config.functionsBaseUrl ?? `https://${projectRef}.supabase.co/functions/v1`).replace(/\/+$/, "");
    }

    private async readProjectRef(): Promise<string> {
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
        return projectRef;
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
        if (!error.message.includes(accessToken)) {
            return error;
        }
        const message = error.message.replaceAll(accessToken, "[redacted]");
        const status = error instanceof IntegrationRuntimeError ? error.status : 500;
        return new IntegrationRuntimeError(message, status);
    }
    if (typeof error === "string") {
        return new IntegrationRuntimeError(error.replaceAll(accessToken, "[redacted]"));
    }
    return error;
}
