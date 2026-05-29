import type { Collection, Db, OptionalUnlessRequiredId } from "mongodb";
import type { GatewayRepository } from "../../interfaces/GatewayRepository";
import type { Provider, Endpoint } from "../../interfaces/Gateway";

/**
 * MongoDB implementation of `GatewayRepository`. One `Provider` = one document,
 * `_id` = its `urn` (so urn uniqueness comes for free via the Mongo key).
 * The caller owns the `MongoClient` lifecycle; it passes the `Db` and
 * calls `init()` once at startup.
 *
 * NB: only `type` imports from `mongodb` here → no runtime coupling.
 * The `Db` is injected by the caller; the gateway has no runtime dependency.
 */
export type MongoGatewayRepositoryConfig = {
    /** Prefix prepended to the collection name (`providers`). Default `""` (single-tenant). */
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
     * Index for lookups by endpoint urn. Idempotent — safe to call on every boot.
     * Provider urn uniqueness is already enforced by `_id`.
     */
    async init(): Promise<void> {
        await this.providers.createIndex({ "endpoints.urn": 1 });
    }

    private get providers(): Collection<ProviderDoc> {
        return this.db.collection<ProviderDoc>(this._prefix + "providers");
    }

    async createProvider(provider: Provider): Promise<Provider> {
        // _id = urn → a duplicate urn causes the insert to fail (Mongo code 11000).
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
