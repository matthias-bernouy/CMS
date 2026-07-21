import { randomUUIDv7 } from "bun";
import type { Identity } from "cms-auth/interfaces/UsersRepository";
import type { LocalCredentialStore, LocalCredential, NewCredential } from "cms-auth/interfaces/LocalCredentialStore";
import { dummyPasswordVerify } from "cms-auth/core/accounts/passwordTiming";

type Record = LocalCredential & { hash: string };

/**
 * In-memory `LocalCredentialStore` for dev and tests. Passwords are hashed with
 * `Bun.password` (argon2id) — never stored in plaintext, even in memory.
 * Mirrors `MongoLocalCredentialStore` semantics (email unique, sub-keyed).
 */
export class InMemoryLocalCredentialStore implements LocalCredentialStore {
    private _bySub = new Map<string, Record>();
    private _emailToSub = new Map<string, string>();

    async create(input: NewCredential): Promise<Identity> {
        const email = input.email.trim().toLowerCase();
        if (this._emailToSub.has(email)) {
            throw new Error("email already registered");
        }
        const now = new Date();
        const rec: Record = {
            sub: randomUUIDv7(),
            email,
            createdAt: now,
            updatedAt: now,
            emailVerifiedAt: input.emailVerified === false ? null : now,
            hash: await Bun.password.hash(input.password),
        };
        this._bySub.set(rec.sub, rec);
        this._emailToSub.set(email, rec.sub);
        return { sub: rec.sub, email };
    }

    async verify(email: string, password: string): Promise<Identity | null> {
        const sub = this._emailToSub.get(email.trim().toLowerCase());
        const rec = sub ? this._bySub.get(sub) : undefined;
        // Spend a verify's worth of time on an unknown email (timing parity).
        if (!rec) {
            await dummyPasswordVerify(password);
            return null;
        }
        if (!(await Bun.password.verify(password, rec.hash))) {
            return null;
        }
        if (rec.emailVerifiedAt === null) {
            return null;
        }
        return { sub: rec.sub, email: rec.email };
    }

    async setPassword(sub: string, password: string): Promise<boolean> {
        const rec = this._bySub.get(sub);
        if (!rec) {
            return false;
        }
        rec.hash = await Bun.password.hash(password);
        rec.updatedAt = new Date();
        return true;
    }

    async markEmailVerified(sub: string): Promise<boolean> {
        const rec = this._bySub.get(sub);
        if (!rec) {
            return false;
        }
        const now = new Date();
        rec.emailVerifiedAt = now;
        rec.updatedAt = now;
        return true;
    }

    async getByEmail(email: string): Promise<LocalCredential | null> {
        const sub = this._emailToSub.get(email.trim().toLowerCase());
        const rec = sub ? this._bySub.get(sub) : undefined;
        return rec ? strip(rec) : null;
    }

    async delete(sub: string): Promise<boolean> {
        const rec = this._bySub.get(sub);
        if (!rec) {
            return false;
        }
        this._bySub.delete(sub);
        this._emailToSub.delete(rec.email);
        return true;
    }

    async list(): Promise<LocalCredential[]> {
        return [...this._bySub.values()].map(strip);
    }
}

const strip = (r: Record): LocalCredential => ({
    sub: r.sub,
    email: r.email,
    emailVerifiedAt: r.emailVerifiedAt,
    createdAt: r.createdAt,
    updatedAt: r.updatedAt,
});
