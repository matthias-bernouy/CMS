import type { Provider, Endpoint } from "./Gateway";

/**
 * Persistence of gateway providers. Aggregate: a `Provider` is stored in full
 * (with its endpoints), keyed by its `urn`. Writes are whole-aggregate: the admin
 * UI submits the complete provider (all endpoints), so there are no endpoint-level
 * mutators — `updateProvider` replaces the document in full.
 */
export interface GatewayRepository {
    /** Persists a provider (key = `provider.urn`). Rejects if the urn already exists. */
    createProvider(provider: Provider): Promise<Provider>;

    /** Replaces a provider in full (key = `provider.urn`, immutable). `null` if the urn does not exist. */
    updateProvider(provider: Provider): Promise<Provider | null>;

    /** Removes a provider by urn (its endpoints live in the aggregate, so they go with it). `false` if absent. */
    deleteProvider(urn: string): Promise<boolean>;

    /** A provider by its urn, e.g. "urn:shop". `null` if not found. */
    getProvider(urn: string): Promise<Provider | null>;

    /** All providers. */
    getAllProviders(): Promise<Provider[]>;

    /**
     * An endpoint by its urn, e.g. "urn:shop:getCart" — the lookup the proxy
     * uses to resolve an incoming request. `null` if not found.
     */
    getEndpoint(urn: string): Promise<Endpoint | null>;
}
