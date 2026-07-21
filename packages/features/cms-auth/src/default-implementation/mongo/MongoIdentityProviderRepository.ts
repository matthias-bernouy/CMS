import type { Collection, Db, OptionalUnlessRequiredId } from "mongodb";
import type {
    IdentityProviderRepository,
    IdentityProvider,
    NewIdentityProvider,
    IdentityProviderPatch,
} from "cms-auth/interfaces/IdentityProvider";

/**
 * MongoDB `IdentityProviderRepository`. One collection (`<prefix>identityProviders`),
 * the provider `id` stored as `_id`. `collectionPrefix` isolates a tenant in a
 * shared Db (same convention as `MongoCmsRepository`). Secrets are NOT stored
 * here — only `clientSecretRef` (a key into the encrypted SecretStore).
 */
export type MongoIdentityProviderConfig = { collectionPrefix?: string };

type ProviderDoc = Omit<IdentityProvider, "id"> & { _id: string };

export class MongoIdentityProviderRepository implements IdentityProviderRepository {
    private readonly _prefix: string;

    constructor(
        private readonly db: Db,
        config: MongoIdentityProviderConfig = {},
    ) {
        this._prefix = config.collectionPrefix ?? "";
    }

    private get col(): Collection<ProviderDoc> {
        return this.db.collection<ProviderDoc>(this._prefix + "identityProviders");
    }

    async list(): Promise<IdentityProvider[]> {
        const docs = await this.col.find().sort({ createdAt: 1 }).toArray();
        return docs.map(fromDoc);
    }

    async get(id: string): Promise<IdentityProvider | null> {
        const d = await this.col.findOne({ _id: id });
        return d ? fromDoc(d) : null;
    }

    async create(input: NewIdentityProvider): Promise<IdentityProvider> {
        const now = new Date();
        const { id, ...rest } = input;
        const doc: ProviderDoc = { _id: id, ...rest, createdAt: now, updatedAt: now };
        try {
            await this.col.insertOne(doc as OptionalUnlessRequiredId<ProviderDoc>);
        } catch (e) {
            throw clashOr(e, id);
        }
        return fromDoc(doc);
    }

    async update(id: string, patch: IdentityProviderPatch): Promise<IdentityProvider | null> {
        const $set = { ...patch, updatedAt: new Date() } as Partial<ProviderDoc>;
        const d = await this.col.findOneAndUpdate({ _id: id }, { $set }, { returnDocument: "after" });
        return d ? fromDoc(d) : null;
    }

    async delete(id: string): Promise<boolean> {
        const r = await this.col.deleteOne({ _id: id });
        return r.deletedCount === 1;
    }
}

function fromDoc(d: ProviderDoc): IdentityProvider {
    const { _id, ...rest } = d;
    return { id: _id, ...rest };
}

function clashOr(e: unknown, id: string): unknown {
    if (e && typeof e === "object" && (e as { code?: number }).code === 11000) {
        return new Error(`identity provider "${id}" already exists`);
    }
    return e;
}
