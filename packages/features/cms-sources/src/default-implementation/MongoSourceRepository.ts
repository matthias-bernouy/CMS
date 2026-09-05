import type { Collection, Db, OptionalUnlessRequiredId } from "mongodb";
import type { SourceRepository } from "../interfaces/SourceRepository";
import type { Source, SourceEndpoint } from "../interfaces/Source";
import { DuplicateSourceError } from "../core/model/errors";

/**
 * MongoDB implementation of `SourceRepository`. One `Source` = one document,
 * `_id` = its `urn` (so urn uniqueness comes for free via the Mongo key).
 * The caller owns the `MongoClient` lifecycle; it passes the `Db` and
 * calls `init()` once at startup.
 *
 * NB: only `type` imports from `mongodb` here → no runtime coupling.
 * The `Db` is injected by the caller; the source has no runtime dependency.
 */
export type MongoSourceRepositoryConfig = {
    /** Prefix prepended to the collection name (`sources`). Default `""` (single-tenant). */
    collectionPrefix?: string;
};

type SourceDoc = Omit<Source, "urn"> & { _id: string }; // _id = urn

export class MongoSourceRepository implements SourceRepository {
    private readonly _prefix: string;

    constructor(
        private readonly db: Db,
        config: MongoSourceRepositoryConfig = {},
    ) {
        this._prefix = config.collectionPrefix ?? "";
    }

    /**
     * Index for lookups by endpoint urn. Idempotent — safe to call on every boot.
     * Source urn uniqueness is already enforced by `_id`.
     */
    async init(): Promise<void> {
        await this.sources.createIndex({ "endpoints.urn": 1 });
    }

    private get sources(): Collection<SourceDoc> {
        return this.db.collection<SourceDoc>(this._prefix + "sources");
    }

    async createSource(source: Source): Promise<Source> {
        try {
            await this.sources.insertOne(toDoc(source) as OptionalUnlessRequiredId<SourceDoc>);
        } catch (e) {
            if (isDuplicateKey(e)) {
                throw new DuplicateSourceError(source.urn);
            }
            throw e;
        }
        return structuredClone(source);
    }

    async updateSource(source: Source): Promise<Source | null> {
        // Full-aggregate replace (not `$set`): a `$set` of `toDoc(source)` would leave
        // stale fields when the new source drops `meta` or shrinks `endpoints`.
        // `_id` (= urn) is the filter, so the key is immutable and the replacement
        // must not carry it (`WithoutId`) — hence `rest`, the source minus its urn.
        const { urn, ...rest } = source;
        const doc = await this.sources.findOneAndReplace({ _id: urn }, rest, { returnDocument: "after" });
        return fromDoc(doc);
    }

    async deleteSource(urn: string): Promise<boolean> {
        const res = await this.sources.deleteOne({ _id: urn });
        return res.deletedCount > 0;
    }

    async getSource(urn: string): Promise<Source | null> {
        return fromDoc(await this.sources.findOne({ _id: urn }));
    }

    async getPersistedSource(urn: string): Promise<Source | null> {
        return fromDoc(await this.sources.findOne({ _id: urn }));
    }

    async getAllSources(): Promise<Source[]> {
        const docs = await this.sources.find().toArray();
        return docs.map((d) => fromDoc(d)!);
    }

    async getEndpoint(urn: string): Promise<SourceEndpoint | null> {
        const doc = await this.sources.findOne({ "endpoints.urn": urn });
        const endpoint = doc?.endpoints.find((e) => e.urn === urn);
        return endpoint ? structuredClone(endpoint) : null; // defensive clone, like the in-memory impl
    }
}

function toDoc(source: Source): SourceDoc {
    const { urn, ...rest } = source;
    return { _id: urn, ...rest };
}

function fromDoc(doc: SourceDoc | null): Source | null {
    if (!doc) {
        return null;
    }
    const { _id, ...rest } = doc;
    return { urn: _id, ...rest };
}

function isDuplicateKey(e: unknown): boolean {
    return !!e && typeof e === "object" && (e as { code?: number }).code === 11000;
}
