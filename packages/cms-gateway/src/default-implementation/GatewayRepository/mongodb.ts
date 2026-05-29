import type { Collection, Db, OptionalUnlessRequiredId } from "mongodb";
import type { GatewayRepository } from "../../interfaces/GatewayRepository";
import type { Provider, Endpoint } from "../../interfaces/Gateway";

/**
 * Implémentation MongoDB de `GatewayRepository`. Un `Provider` = un document,
 * `_id` = son `urn` (donc l'unicité de l'urn est gratuite via la clé Mongo).
 * L'appelant possède le cycle de vie du `MongoClient` ; il passe le `Db` et
 * appelle `init()` une fois au démarrage.
 *
 * NB : uniquement des imports `type` de `mongodb` ici → aucun couplage runtime.
 * Le `Db` est injecté par l'appelant ; le gateway reste sans dépendance d'exécution.
 */
export type MongoGatewayRepositoryConfig = {
    /** Préfixe ajouté au nom de collection (`providers`). Défaut `""` (mono-tenant). */
    collectionPrefix?: string;
};

type ProviderDoc = Omit<Provider, "urn"> & { _id: string };   // _id = urn

export class MongoGatewayRepository implements GatewayRepository {

    private readonly _prefix: string;

    constructor(
        private readonly db: Db,
        config: MongoGatewayRepositoryConfig = {},
    ) {
        this._prefix = config.collectionPrefix ?? "";
    }

    /**
     * Index pour la lecture par urn d'endpoint. Idempotent — sûr à chaque boot.
     * L'unicité de l'urn de provider est déjà assurée par `_id`.
     */
    async init(): Promise<void> {
        await this.providers.createIndex({ "endpoints.urn": 1 });
    }

    private get providers(): Collection<ProviderDoc> {
        return this.db.collection<ProviderDoc>(this._prefix + "providers");
    }

    async createProvider(provider: Provider): Promise<Provider> {
        // _id = urn → un urn dupliqué fait échouer l'insert (Mongo code 11000).
        await this.providers.insertOne(toDoc(provider) as OptionalUnlessRequiredId<ProviderDoc>);
        return structuredClone(provider);
    }

    async getProvider(urn: string): Promise<Provider | null> {
        return fromDoc(await this.providers.findOne({ _id: urn }));
    }

    async getAllProviders(): Promise<Provider[]> {
        const docs = await this.providers.find().toArray();
        return docs.map(d => fromDoc(d)!);
    }

    async getEndpoint(urn: string): Promise<Endpoint | null> {
        const doc = await this.providers.findOne({ "endpoints.urn": urn });
        return doc?.endpoints.find(e => e.urn === urn) ?? null;
    }
}

function toDoc(provider: Provider): ProviderDoc {
    const { urn, ...rest } = provider;
    return { _id: urn, ...rest };
}

function fromDoc(doc: ProviderDoc | null): Provider | null {
    if (!doc) return null;
    const { _id, ...rest } = doc;
    return { urn: _id, ...rest };
}
