import type { Collection, Db, OptionalUnlessRequiredId } from "mongodb";
import type { GatewayRepository } from "../interfaces/GatewayRepository";
import type { Provider, Endpoint } from "../interfaces/Gateway";
import { DuplicateProviderError } from "../core/errors";

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
        try {
            await this.providers.insertOne(toDoc(provider) as OptionalUnlessRequiredId<ProviderDoc>);
        } catch (e) {
            if (isDuplicateKey(e)) throw new DuplicateProviderError(provider.urn);
            throw e;
        }
        return structuredClone(provider);
    }

    async updateProvider(provider: Provider): Promise<Provider | null> {
        // Full-aggregate replace (not `$set`): a `$set` of `toDoc(provider)` would leave
        // stale fields when the new provider drops `meta` or shrinks `endpoints`.
        // `_id` (= urn) is the filter, so the key is immutable and the replacement
        // must not carry it (`WithoutId`) — hence `rest`, the provider minus its urn.
        const { urn, ...rest } = provider;
        const doc = await this.providers.findOneAndReplace(
            { _id: urn },
            rest,
            { returnDocument: "after" },
        );
        return fromDoc(doc);
    }

    async deleteProvider(urn: string): Promise<boolean> {
        const res = await this.providers.deleteOne({ _id: urn });
        return res.deletedCount > 0;
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
        const endpoint = doc?.endpoints.find(e => e.urn === urn);
        return endpoint ? structuredClone(endpoint) : null;   // defensive clone, like the in-memory impl
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

function isDuplicateKey(e: unknown): boolean {
    return !!e && typeof e === "object" && (e as { code?: number }).code === 11000;
}
