import { SUPABASE_CONNECTOR_ACCESS_TOKEN_SECRET_KEY } from "@bernouy/cms-integrations";
import type { ControlCms } from "cms-control/ControlCms";
import type { ConnectorProviderUpdateDto } from "cms-control/core/validation/integrations/parseConnectorProviderDto";
import InvalidParam from "cms-control/errors/Http/InvalidParam";

export type ConnectorProviderSettingsResponse = {
    provider: "supabase";
    enabled: boolean;
    projectRef: string;
    accessTokenConfigured: boolean;
};

export async function getConnectorProviderSettings(cms: ControlCms): Promise<ConnectorProviderSettingsResponse> {
    const [provider, secretKeys] = await Promise.all([
        cms.integrationConnectorProviders.get("supabase"),
        cms.secrets.listKeys(),
    ]);
    return {
        provider: "supabase",
        enabled: provider?.enabled ?? false,
        projectRef: provider?.projectRef ?? "",
        accessTokenConfigured: secretKeys.includes(SUPABASE_CONNECTOR_ACCESS_TOKEN_SECRET_KEY),
    };
}

export async function updateConnectorProviderSettings(
    cms: ControlCms,
    dto: ConnectorProviderUpdateDto,
): Promise<ConnectorProviderSettingsResponse> {
    const accessToken = dto.accessToken?.trim() ?? "";

    if (dto.enabled && !dto.projectRef) {
        throw new InvalidParam("projectRef", "is required when the provider is enabled");
    }

    const provider = {
        provider: "supabase" as const,
        enabled: dto.enabled,
        projectRef: dto.projectRef,
    };

    if (!accessToken) {
        const accessTokenConfigured = (await cms.secrets.listKeys()).includes(
            SUPABASE_CONNECTOR_ACCESS_TOKEN_SECRET_KEY,
        );
        if (dto.enabled && !accessTokenConfigured) {
            throw new InvalidParam("accessToken", "is required when the provider is enabled");
        }
        const saved = await cms.integrationConnectorProviders.upsert(provider);
        return {
            provider: "supabase",
            enabled: saved.enabled,
            projectRef: saved.projectRef,
            accessTokenConfigured,
        };
    }

    const previousToken = await cms.secrets.get(SUPABASE_CONNECTOR_ACCESS_TOKEN_SECRET_KEY);
    await cms.secrets.set(SUPABASE_CONNECTOR_ACCESS_TOKEN_SECRET_KEY, accessToken);
    try {
        const saved = await cms.integrationConnectorProviders.upsert(provider);
        return {
            provider: "supabase",
            enabled: saved.enabled,
            projectRef: saved.projectRef,
            accessTokenConfigured: true,
        };
    } catch (error) {
        try {
            if (previousToken === null) {
                await cms.secrets.delete(SUPABASE_CONNECTOR_ACCESS_TOKEN_SECRET_KEY);
            } else {
                await cms.secrets.set(SUPABASE_CONNECTOR_ACCESS_TOKEN_SECRET_KEY, previousToken);
            }
        } catch {
            // Preserve the provider write error if best-effort secret rollback fails.
        }
        throw error;
    }
}
