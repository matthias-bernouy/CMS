import type { GatewayRepository } from "../interfaces/GatewayRepository";
import type { Provider, Endpoint } from "../interfaces/Gateway";
import { DuplicateProviderError } from "../core/errors";

/**
 * In-memory implementation of `GatewayRepository` — the dep-free default, for
 * dev and tests. Defensive cloning (`structuredClone`) on input and output:
 * stored data is plain JSON, so cloning is safe.
 */
export class InMemoryGatewayRepository implements GatewayRepository {
    private _providers = new Map<string, Provider>();   // keyed by provider.urn

    async createProvider(provider: Provider): Promise<Provider> {
        if (this._providers.has(provider.urn)) {
            throw new DuplicateProviderError(provider.urn);
        }
        this._providers.set(provider.urn, structuredClone(provider));
        return structuredClone(provider);
    }

    async updateProvider(provider: Provider): Promise<Provider | null> {
        if (!this._providers.has(provider.urn)) return null;
        this._providers.set(provider.urn, structuredClone(provider));
        return structuredClone(provider);
    }

    async deleteProvider(urn: string): Promise<boolean> {
        return this._providers.delete(urn);
    }

    async getProvider(urn: string): Promise<Provider | null> {
        const found = this._providers.get(urn);
        return found ? structuredClone(found) : null;
    }

    async getAllProviders(): Promise<Provider[]> {
        return Array.from(this._providers.values(), p => structuredClone(p));
    }

    async getEndpoint(urn: string): Promise<Endpoint | null> {
        for (const provider of this._providers.values()) {
            const endpoint = provider.endpoints.find(e => e.urn === urn);
            if (endpoint) return structuredClone(endpoint);
        }
        return null;
    }
}
