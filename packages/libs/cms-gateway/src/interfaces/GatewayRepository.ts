import type { Provider, Endpoint } from "./Gateway";

/**
 * Persistence of gateway providers. Aggregate: a `Provider` is stored in full
 * (with its endpoints), keyed by its `urn`.
 *
 * Step 0: creation + reads only. `updateProvider`/`deleteProvider`
 * will come with the admin UI.
 */
export interface GatewayRepository {
    /** Persists a provider (key = `provider.urn`). Rejects if the urn already exists. */
    createProvider(provider: Provider): Promise<Provider>;

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
