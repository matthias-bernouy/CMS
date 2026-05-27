import { randomUUIDv7 } from "bun";
import type { Collection, Db, OptionalUnlessRequiredId } from "mongodb";
import type { EncryptedBlob } from "@bernouy/core";
import type { Identity } from "src/socle/interfaces/UsersRepository";
import type { LocalCredentialStore, LocalCredential, NewCredential } from "src/socle/interfaces/LocalCredentialStore";
import type { PiiCrypto } from "src/socle/auth/PiiCrypto";
import { dummyPasswordVerify } from "src/socle/auth/passwordTiming";

/**
 * MongoDB `LocalCredentialStore`. One collection (`<prefix>credentials`), `sub`
 * as `_id`. `collectionPrefix` isolates a tenant.
 *
 * Two layers of protection:
 *  - the **password** is hashed with `Bun.password` (argon2id) — one-way.
 *  - the **email** (PII) is encrypted at rest under the tenant DEK (`PiiCrypto`),
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
    createdAt:  Date;
    updatedAt:  Date;
};

export class MongoLocalCredentialStore implements LocalCredentialStore {

    private readonly _prefix: string;

    constructor(
        private readonly db: Db,
        private readonly pii: PiiCrypto,
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
        const email = input.email.trim().toLowerCase();
        const now = new Date();
        const doc: CredentialDoc = {
            _id:        randomUUIDv7(),
            emailEnc:   await this.pii.encrypt(email),
            emailIndex: this.pii.blindIndex(email),
            hash:       await Bun.password.hash(input.password),
            createdAt:  now,
            updatedAt:  now,
        };
        try { await this.col.insertOne(doc as OptionalUnlessRequiredId<CredentialDoc>); }
        catch (e) {
            if (e && typeof e === "object" && (e as { code?: number }).code === 11000) throw new Error("email already registered");
            throw e;
        }
        return { sub: doc._id, email, displayName: input.displayName ?? email };
    }

    async verify(email: string, password: string): Promise<Identity | null> {
        const doc = await this.col.findOne({ emailIndex: this.pii.blindIndex(email) });
        // Spend a verify's worth of time on an unknown email too, so timing
        // doesn't reveal which emails are registered.
        if (!doc) { await dummyPasswordVerify(password); return null; }
        if (!(await Bun.password.verify(password, doc.hash))) return null;
        // No `displayName`: the credential store doesn't own one. Returning the
        // email here would overwrite the user's real displayName on every login
        // (SubjectResolver.upsert only updates provided fields).
        const stored = await this.pii.decrypt(doc.emailEnc);
        return { sub: doc._id, email: stored };
    }

    async setPassword(sub: string, password: string): Promise<boolean> {
        const r = await this.col.updateOne(
            { _id: sub },
            { $set: { hash: await Bun.password.hash(password), updatedAt: new Date() } },
        );
        return r.matchedCount === 1;
    }

    async getByEmail(email: string): Promise<LocalCredential | null> {
        const d = await this.col.findOne({ emailIndex: this.pii.blindIndex(email) });
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
        return { sub: d._id, email: await this.pii.decrypt(d.emailEnc), createdAt: d.createdAt, updatedAt: d.updatedAt };
    }
}
