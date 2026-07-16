/**
 * Reserved SecretStore key containing the Supabase Management API access token.
 * Provider records deliberately contain only non-secret configuration.
 */
export const SUPABASE_CONNECTOR_ACCESS_TOKEN_SECRET_KEY = "SUPABASE_CONNECTOR_ACCESS_TOKEN";

/**
 * Per-CMS connector deployment target. The current connector contract resolves
 * deployers by provider kind, so a tenant can configure one Supabase target.
 */
export type IntegrationConnectorProvider = {
    provider: "supabase";
    enabled: boolean;
    projectRef: string;
};

export interface IntegrationConnectorProviderRepository {
    get(provider: IntegrationConnectorProvider["provider"]): Promise<IntegrationConnectorProvider | null>;
    upsert(provider: IntegrationConnectorProvider): Promise<IntegrationConnectorProvider>;
}
