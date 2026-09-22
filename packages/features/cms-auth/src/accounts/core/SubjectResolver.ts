import type { Subject } from "cms-auth/application/interfaces/Authentication";
import type { Identity, TUser, UsersRepository } from "cms-auth/accounts/interfaces/UsersRepository";

/**
 * Stable internal user id = `<provider>:<sub>`. Namespacing the provider's
 * `sub` keeps two providers from colliding (Keycloak sub "123" ≠ Google sub
 * "123") and means identity is NEVER keyed by email — two identities sharing
 * an email stay distinct users.
 */
export const internalUserId = (provider: string | undefined, sub: string): string =>
    provider ? `${provider}:${sub}` : sub;

/**
 * Turns an authenticated `Identity` into a CMS member subject. Authorization is
 * resolved by views outside the authentication package.
 */
export class SubjectResolver {
    constructor(private readonly users: UsersRepository) {}

    /** Fresh login: record the identity under its `provider:sub` key, return the Subject. */
    async fromIdentity(identity: Identity): Promise<Subject> {
        const id = internalUserId(identity.provider, identity.sub);
        const user = await this.users.upsert({ ...identity, sub: id });
        return toSubject(user);
    }

    /** Already-authenticated principal (session cookie / PAT). `null` when the
     *  `sub` is unknown — e.g. the user was deleted while a session is in flight. */
    async fromSub(sub: string): Promise<Subject | null> {
        const user = await this.users.getBySub(sub);
        return user ? toSubject(user) : null;
    }
}

function toSubject(u: TUser): Subject {
    return { identifier: u.sub, ...(u.email ? { email: u.email } : {}) };
}
