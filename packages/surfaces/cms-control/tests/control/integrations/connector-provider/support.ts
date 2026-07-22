import { InMemoryIntegrationConnectorProviderRepository } from "@bernouy/cms-integrations";
import { InMemorySecretStore } from "@bernouy/cms-secrets";

export function fixture(initial?: { enabled: boolean; projectRef: string }) {
    const providers = new InMemoryIntegrationConnectorProviderRepository(
        initial ? { provider: "supabase", ...initial } : undefined,
    );
    const secrets = new InMemorySecretStore();
    return {
        providers,
        secrets,
        cms: { integrationConnectorProviders: providers, secrets } as any,
    };
}

export function jsonRequest(body: Record<string, unknown>): Request {
    return new Request("http://localhost/api/integrations/connector-provider", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
    });
}
