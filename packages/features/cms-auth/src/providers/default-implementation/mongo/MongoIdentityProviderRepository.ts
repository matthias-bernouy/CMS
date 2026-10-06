import type { Collection, Db, OptionalUnlessRequiredId } from "mongodb";
import type {
    IdentityProviderRepository,
    IdentityProvider,
    NewIdentityProvider,
    IdentityProviderPatch,
} from "cms-auth/providers/interfaces/IdentityProvider";

/**
 * MongoDB `IdentityProviderRepository`. One collection (`<prefix>identityProviders`),
 * the provider `id` stored as `_id`. `collectionPrefix` isolates a tenant in a
 * shared Db (same convention as `MongoCmsRepository`). Secrets are NOT stored
 * here — only `clientSecretRef` (a key into the encrypted SecretStore).
 */
export type MongoIdentityProviderConfig = { collectionPrefix?: string };

type ProviderDoc = Omit<IdentityProvider, "id" | "revision"> & { _id: string; revision?: number };

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
        const doc: ProviderDoc = { _id: id, ...rest, revision: 1, createdAt: now, updatedAt: now };
        try {
            await this.col.insertOne(doc as OptionalUnlessRequiredId<ProviderDoc>);
        } catch (e) {
            throw clashOr(e, id);
        }
        return fromDoc(doc);
    }

    async update(
        id: string,
        patch: IdentityProviderPatch,
        expectedRevision?: number,
    ): Promise<IdentityProvider | null> {
        const current = await this.col.findOne({ _id: id });
        if (!current) {
            return null;
        }
        const revision = current.revision ?? 1;
        assertRevision(revision, expectedRevision);
        const $set = { ...patch, revision: revision + 1, updatedAt: new Date() } as Partial<ProviderDoc>;
        const d = await this.col.findOneAndUpdate(
            expectedRevision === undefined ? { _id: id } : revisionFilter(id, expectedRevision),
            { $set },
            { returnDocument: "after" },
        );
        if (!d && expectedRevision !== undefined) {
            throw revisionConflict();
        }
        return d ? fromDoc(d) : null;
    }

    async delete(id: string, expectedRevision?: number): Promise<boolean> {
        const current = await this.col.findOne({ _id: id });
        if (!current) {
            return false;
        }
        assertRevision(current.revision ?? 1, expectedRevision);
        const r = await this.col.deleteOne(
            expectedRevision === undefined ? { _id: id } : revisionFilter(id, expectedRevision),
        );
        if (r.deletedCount === 0 && expectedRevision !== undefined) {
            throw revisionConflict();
        }
        return r.deletedCount === 1;
    }
}

function fromDoc(d: ProviderDoc): IdentityProvider {
    const { _id, ...rest } = d;
    return { id: _id, ...rest, revision: d.revision ?? 1 };
}

function clashOr(e: unknown, id: string): unknown {
    if (e && typeof e === "object" && (e as { code?: number }).code === 11000) {
        return new Error(`identity provider "${id}" already exists`);
    }
    return e;
}

function revisionFilter(id: string, revision: number) {
    return revision === 1
        ? { _id: id, $or: [{ revision: 1 }, { revision: { $exists: false } }] }
        : { _id: id, revision };
}

function assertRevision(actual: number, expected: number | undefined): void {
    if (expected !== undefined && actual !== expected) {
        throw revisionConflict();
    }
}

function revisionConflict(): Error & { status: number } {
    return Object.assign(new Error("identity provider revision conflict"), { status: 409 });
}
