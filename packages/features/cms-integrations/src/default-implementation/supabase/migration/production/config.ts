import type { SecretReader } from "@bernouy/cms-secrets";
import { IntegrationRuntimeError } from "../../../../core/errors";
import {
    SUPABASE_CONNECTOR_ACCESS_TOKEN_SECRET_KEY,
    type IntegrationConnectorProviderRepository,
} from "../../../../interfaces/IntegrationConnectorProvider";
import type { SupabaseConnectorDeployerConfig } from "../../types";

export type ConfiguredSupabaseMigrationServicesConfig = {
    providerRepository: IntegrationConnectorProviderRepository;
    secrets: SecretReader;
    apiBaseUrl?: string;
    functionsBaseUrl?: string;
    fetch?: typeof fetch;
};

export type ResolvedSupabaseMigrationConfig = SupabaseConnectorDeployerConfig & {
    functionsBaseUrl: string;
};

export async function resolveSupabaseMigrationConfig(
    config: ConfiguredSupabaseMigrationServicesConfig,
): Promise<ResolvedSupabaseMigrationConfig> {
    const provider = await config.providerRepository.get("supabase");
    if (!provider) {
        throw new IntegrationRuntimeError("Supabase connector provider is not configured");
    }
    if (!provider.enabled) {
        throw new IntegrationRuntimeError("Supabase connector provider is disabled");
    }
    const projectRef = provider.projectRef.trim();
    if (!projectRef) {
        throw new IntegrationRuntimeError("Supabase connector provider project reference is not configured");
    }

    let stored: string | null;
    try {
        stored = await config.secrets.get(SUPABASE_CONNECTOR_ACCESS_TOKEN_SECRET_KEY);
    } catch {
        throw new IntegrationRuntimeError("Supabase connector provider access token could not be read");
    }
    const accessToken = stored?.trim() ?? "";
    if (!accessToken) {
        throw new IntegrationRuntimeError("Supabase connector provider access token is not configured");
    }
    return {
        projectRef,
        accessToken,
        functionsBaseUrl: (config.functionsBaseUrl ?? `https://${projectRef}.supabase.co/functions/v1`).replace(
            /\/+$/,
            "",
        ),
        ...(config.apiBaseUrl !== undefined ? { apiBaseUrl: config.apiBaseUrl } : {}),
        ...(config.fetch !== undefined ? { fetch: config.fetch } : {}),
    };
}

export function redactSupabaseAccessToken(error: unknown, accessToken: string): unknown {
    if (error instanceof Error) {
        if (!error.message.includes(accessToken)) {
            return error;
        }
        const status = error instanceof IntegrationRuntimeError ? error.status : 500;
        return new IntegrationRuntimeError(error.message.replaceAll(accessToken, "[redacted]"), status);
    }
    if (typeof error === "string") {
        return new IntegrationRuntimeError(error.replaceAll(accessToken, "[redacted]"));
    }
    return error;
}
