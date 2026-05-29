import type { Provider, Endpoint } from "./Gateway";

/**
 * Persistance des providers du gateway. Agrégat : un `Provider` est stocké en
 * entier (avec ses endpoints), clé = son `urn`.
 *
 * Étape 0 : création + lectures uniquement. `updateProvider`/`deleteProvider`
 * arriveront avec l'UI admin.
 */
export interface GatewayRepository {
    /** Persiste un provider (clé = `provider.urn`). Rejette si l'urn existe déjà. */
    createProvider(provider: Provider): Promise<Provider>;

    /** Un provider par son urn, ex: "urn:shop". `null` si absent. */
    getProvider(urn: string): Promise<Provider | null>;

    /** Tous les providers. */
    getAllProviders(): Promise<Provider[]>;

    /**
     * Un endpoint par son urn, ex: "urn:shop:getCart" — la lecture dont le proxy
     * se sert pour résoudre une requête entrante. `null` si absent.
     */
    getEndpoint(urn: string): Promise<Endpoint | null>;
}
