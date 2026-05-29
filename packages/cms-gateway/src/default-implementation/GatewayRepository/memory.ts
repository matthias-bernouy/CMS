import type { GatewayRepository } from "../../interfaces/GatewayRepository";
import type { Provider, Endpoint } from "../../interfaces/Gateway";

/**
 * Implémentation en mémoire de `GatewayRepository` — le défaut dep-free, pour le
 * dev et les tests. Clonage défensif (`structuredClone`) en entrée et en sortie :
 * les données stockées sont du JSON pur, donc clonables sans souci.
 */
export class InMemoryGatewayRepository implements GatewayRepository {
    private _providers = new Map<string, Provider>();   // par provider.urn

    async createProvider(provider: Provider): Promise<Provider> {
        if (this._providers.has(provider.urn)) {
            throw new Error(`Provider with urn "${provider.urn}" already exists`);
        }
        this._providers.set(provider.urn, structuredClone(provider));
        return structuredClone(provider);
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
