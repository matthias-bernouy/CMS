import { randomUUIDv7 } from "bun";
import type { Collection, Db, OptionalUnlessRequiredId } from "mongodb";
import type { EncryptedBlob } from "@bernouy/envelope-crypto";
import type { Identity } from "cms-auth/interfaces/UsersRepository";
import type { LocalCredentialStore, LocalCredential, NewCredential } from "cms-auth/interfaces/LocalCredentialStore";
import type { FieldCrypto } from "@bernouy/envelope-crypto";
import { dummyPasswordVerify } from "cms-auth/core/passwordTiming";

/**
 * MongoDB `LocalCredentialStore`. One collection (`<prefix>credentials`), `sub`
 * as `_id`. `collectionPrefix` isolates a tenant.
 *
 * Two layers of protection:
 *  - the **password** is hashed with `Bun.password` (argon2id) — one-way.
 *  - the **email** (PII) is encrypted at rest under the tenant DEK (`FieldCrypto`),
 *    with a UNIQUE blind index `emailIndex` (HMAC) for exact-match login lookup
 *    + uniqueness. The plaintext email is never persisted.
 *
 * Call `init()` once at boot to create the unique `emailIndex` index.
 */
export type MongoLocalCredentialConfig = { collectionPrefix?: string };

type CredentialDoc = {
    _id:        string;
    emailEnc:   EncryptedBlob;
    emailIndex: string;       // unique HMAC(email)
    hash:       string;       // argon2id password hash
    emailVerifiedAt?: Date | null;
    createdAt:       Date;
    updatedAt:       Date;
};

export class MongoLocalCredentialStore implements LocalCredentialStore {

    private readonly _prefix: string;

    constructor(
        private readonly db: Db,
        private readonly fieldCrypto: FieldCrypto,
        config: MongoLocalCredentialConfig = {},
    ) {
        this._prefix = config.collectionPrefix ?? "";
    }

    async init(): Promise<void> {
        await this.col.createIndex({ emailIndex: 1 }, { unique: true });
    }

    private get col(): Collection<CredentialDoc> {
        return this.db.collection<CredentialDoc>(this._prefix + "credentials");
    }

    async create(input: NewCredential): Promise<Identity> {
        const email = normalizeEmail(input.email);
        const now = new Date();
        const doc: CredentialDoc = {
            _id:             randomUUIDv7(),
            emailEnc:        await this.fieldCrypto.encrypt(email),
            emailIndex:      this.fieldCrypto.blindIndex(email),
            hash:            await Bun.password.hash(input.password),
            emailVerifiedAt: input.emailVerified === false ? null : now,
            createdAt:       now,
            updatedAt:       now,
        };
        try { await this.col.insertOne(doc as OptionalUnlessRequiredId<CredentialDoc>); }
        catch (e) {
            if (e && typeof e === "object" && (e as { code?: number }).code === 11000) throw new Error("email already registered");
            throw e;
        }
        return { sub: doc._id, email, displayName: input.displayName ?? email };
    }

    async verify(email: string, password: string): Promise<Identity | null> {
        const doc = await this.col.findOne({ emailIndex: this.fieldCrypto.blindIndex(normalizeEmail(email)) });
        // Spend a verify's worth of time on an unknown email too, so timing
        // doesn't reveal which emails are registered.
        if (!doc) { await dummyPasswordVerify(password); return null; }
        if (!(await Bun.password.verify(password, doc.hash))) return null;
        if (doc.emailVerifiedAt === null) return null;
        // No `displayName`: the credential store doesn't own one. Returning the
        // email here would overwrite the user's real displayName on every login
        // (SubjectResolver.upsert only updates provided fields).
        const stored = await this.fieldCrypto.decrypt(doc.emailEnc);
        return { sub: doc._id, email: stored };
    }

    async setPassword(sub: string, password: string): Promise<boolean> {
        const r = await this.col.updateOne(
            { _id: sub },
            { $set: { hash: await Bun.password.hash(password), updatedAt: new Date() } },
        );
        return r.matchedCount === 1;
    }

    async markEmailVerified(sub: string): Promise<boolean> {
        const r = await this.col.updateOne(
            { _id: sub },
            { $set: { emailVerifiedAt: new Date(), updatedAt: new Date() } },
        );
        return r.matchedCount === 1;
    }

    async getByEmail(email: string): Promise<LocalCredential | null> {
        const d = await this.col.findOne({ emailIndex: this.fieldCrypto.blindIndex(normalizeEmail(email)) });
        return d ? this._fromDoc(d) : null;
    }

    async delete(sub: string): Promise<boolean> {
        const r = await this.col.deleteOne({ _id: sub });
        return r.deletedCount === 1;
    }

    async list(): Promise<LocalCredential[]> {
        const docs = await this.col.find().sort({ createdAt: 1 }).toArray();
        return Promise.all(docs.map(d => this._fromDoc(d)));
    }

    private async _fromDoc(d: CredentialDoc): Promise<LocalCredential> {
        return {
            sub: d._id,
            email: await this.fieldCrypto.decrypt(d.emailEnc),
            emailVerifiedAt: d.emailVerifiedAt === undefined ? d.createdAt : d.emailVerifiedAt,
            createdAt: d.createdAt,
            updatedAt: d.updatedAt,
        };
    }
}

const normalizeEmail = (email: string): string => email.trim().toLowerCase();
