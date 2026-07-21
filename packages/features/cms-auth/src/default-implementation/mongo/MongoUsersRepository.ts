import type { Collection, Db } from "mongodb";
import type { EncryptedBlob } from "@bernouy/envelope-crypto";
import type {
    UsersRepository,
    Identity,
    TUser,
    UsersListOptions,
    UsersPage,
} from "cms-auth/interfaces/UsersRepository";
import type { FieldCrypto } from "@bernouy/envelope-crypto";

/**
 * MongoDB `UsersRepository`. One collection (`<prefix>users`), the identity
 * `sub` stored as `_id`. `collectionPrefix` isolates a tenant.
 *
 * PII is encrypted at rest under the tenant DEK (`FieldCrypto`): `email` is
 * stored as ciphertext, never in clear. `emailIndex` is a blind index (HMAC)
 * enabling EXACT-match search only — substring search and sorting on PII are
 * not possible, so `list` sorts by `createdAt` /
 * `lastSeenAt` and `search` is an exact email match.
 */
export type MongoUsersConfig = { collectionPrefix?: string };

type UserDoc<Role extends string> = {
    _id: string;
    role: Role;
    createdAt: Date;
    lastSeenAt: Date;
    provider?: string; // provenance (not PII): "local", "google"…
    emailEnc?: EncryptedBlob;
    emailIndex?: string; // HMAC(email) — exact-match lookup
};

export class MongoUsersRepository<Role extends string = string> implements UsersRepository<Role> {
    private readonly _prefix: string;

    constructor(
        private readonly db: Db,
        private readonly fieldCrypto: FieldCrypto,
        config: MongoUsersConfig = {},
    ) {
        this._prefix = config.collectionPrefix ?? "";
    }

    private get col(): Collection<UserDoc<Role>> {
        return this.db.collection<UserDoc<Role>>(this._prefix + "users");
    }

    async upsert(identity: Identity, defaultRole: Role): Promise<TUser<Role>> {
        const now = new Date();
        const $set: Partial<UserDoc<Role>> = { lastSeenAt: now };
        if (identity.email !== undefined) {
            $set.emailEnc = await this.fieldCrypto.encrypt(identity.email);
            $set.emailIndex = this.fieldCrypto.blindIndex(identity.email);
        }
        if (identity.provider !== undefined) {
            $set.provider = identity.provider;
        }
        const d = await this.col.findOneAndUpdate(
            { _id: identity.sub },
            { $set, $setOnInsert: { role: defaultRole, createdAt: now } },
            { upsert: true, returnDocument: "after" },
        );
        return this._fromDoc(d!);
    }

    async getBySub(sub: string): Promise<TUser<Role> | null> {
        const d = await this.col.findOne({ _id: sub });
        return d ? this._fromDoc(d) : null;
    }

    async setRole(sub: string, role: Role): Promise<TUser<Role> | null> {
        const d = await this.col.findOneAndUpdate(
            { _id: sub },
            { $set: { role } as Partial<UserDoc<Role>> },
            { returnDocument: "after" },
        );
        return d ? this._fromDoc(d) : null;
    }

    async delete(sub: string): Promise<boolean> {
        const r = await this.col.deleteOne({ _id: sub });
        return r.deletedCount === 1;
    }

    async list(opts: UsersListOptions = {}): Promise<UsersPage<Role>> {
        const filter: Record<string, unknown> = {};
        if (opts.role) {
            filter.role = opts.role;
        }
        if (opts.search) {
            filter.emailIndex = this.fieldCrypto.blindIndex(opts.search); // exact email only
        }

        // PII can't be sorted server-side (encrypted); fall back to createdAt.
        const sortField = opts.sortBy === "createdAt" || opts.sortBy === "lastSeenAt" ? opts.sortBy : "createdAt";
        const sort = { [sortField]: opts.sortOrder === "desc" ? -1 : 1 } as Record<string, 1 | -1>;
        const total = await this.col.countDocuments(filter);

        let cursor = this.col.find(filter).sort(sort);
        if (opts.pagination) {
            cursor = cursor.skip((opts.pagination.page - 1) * opts.pagination.limit).limit(opts.pagination.limit);
        }
        const docs = await cursor.toArray();

        const page = opts.pagination?.page ?? 1;
        const limit = opts.pagination?.limit ?? total;
        const users = await Promise.all(docs.map((d) => this._fromDoc(d)));
        return { users, total, page, limit, hasMore: (page - 1) * limit + docs.length < total };
    }

    private async _fromDoc(d: UserDoc<Role>): Promise<TUser<Role>> {
        const out: TUser<Role> = { sub: d._id, role: d.role, createdAt: d.createdAt, lastSeenAt: d.lastSeenAt };
        if (d.provider) {
            out.provider = d.provider;
        }
        if (d.emailEnc) {
            out.email = await this.fieldCrypto.decrypt(d.emailEnc);
        }
        return out;
    }
}
