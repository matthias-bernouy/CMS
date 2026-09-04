import type {
    IntegrationConnectorProvider,
    IntegrationConnectorProviderRepository,
} from "../../interfaces/IntegrationConnectorDeployer/provider";

export class InMemoryIntegrationConnectorProviderRepository implements IntegrationConnectorProviderRepository {
    private configuredProvider: IntegrationConnectorProvider | null = null;

    constructor(provider?: IntegrationConnectorProvider) {
        this.configuredProvider = provider ? copy(provider) : null;
    }

    async get(provider: IntegrationConnectorProvider["provider"]): Promise<IntegrationConnectorProvider | null> {
        if (provider !== this.configuredProvider?.provider) {
            return null;
        }
        return copy(this.configuredProvider);
    }

    async upsert(provider: IntegrationConnectorProvider): Promise<IntegrationConnectorProvider> {
        this.configuredProvider = copy(provider);
        return copy(provider);
    }
}

function copy(provider: IntegrationConnectorProvider): IntegrationConnectorProvider {
    return { ...provider };
}
