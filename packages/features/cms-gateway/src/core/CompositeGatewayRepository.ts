import type { Provider, Endpoint } from "../interfaces/Gateway";
import type { GatewayRepository } from "../interfaces/GatewayRepository";
import { GatewayValidationError } from "./errors";
import { systemProviderUrnOf } from "./systemProviders";

/**
 * Readonly system providers + a writable user provider store behind one
 * GatewayRepository. The editor can list and select system endpoints using the
 * same gateway source model, while writes stay scoped to user providers.
 */
export class CompositeGatewayRepository implements GatewayRepository {
    private readonly systemProviders = new Map<string, Provider>();

    constructor(
        private readonly inner: GatewayRepository,
        systemProviders: readonly Provider[] = [],
    ) {
        for (const provider of systemProviders) {
            this.systemProviders.set(provider.urn, structuredClone(provider));
        }
    }

    async createProvider(provider: Provider): Promise<Provider> {
        this.assertUserProvider(provider.urn, "system provider namespace is reserved");
        return this.inner.createProvider(provider);
    }

    async updateProvider(provider: Provider): Promise<Provider | null> {
        this.assertUserProvider(provider.urn, "system providers are readonly");
        return this.inner.updateProvider(provider);
    }

    async deleteProvider(urn: string): Promise<boolean> {
        this.assertUserProvider(urn, "system providers are readonly");
        return this.inner.deleteProvider(urn);
    }

    async getProvider(urn: string): Promise<Provider | null> {
        const system = this.systemProviders.get(urn);
        if (system) return structuredClone(system);
        return this.inner.getProvider(urn);
    }

    async getAllProviders(): Promise<Provider[]> {
        const systemUrns = new Set(this.systemProviders.keys());
        const system = Array.from(this.systemProviders.values(), provider => structuredClone(provider));
        const user = (await this.inner.getAllProviders())
            .filter(provider => !systemUrns.has(provider.urn) && !systemProviderUrnOf(provider.urn));
        return [...system, ...user];
    }

    async getEndpoint(urn: string): Promise<Endpoint | null> {
        const systemUrn = systemProviderUrnOf(urn);
        if (systemUrn) {
            const system = this.systemProviders.get(systemUrn);
            const endpoint = system?.endpoints.find(candidate => candidate.urn === urn);
            return endpoint ? structuredClone(endpoint) : null;
        }
        return this.inner.getEndpoint(urn);
    }

    private assertUserProvider(urn: string, message: string): void {
        if (systemProviderUrnOf(urn)) throw new GatewayValidationError("urn", message);
    }
}
