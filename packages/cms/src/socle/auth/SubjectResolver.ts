import type { Subject } from "@bernouy/core";
import type { Identity, TUser, UsersRepository } from "src/socle/interfaces/UsersRepository";

/**
 * Stable internal user id = `<provider>:<sub>`. Namespacing the provider's
 * `sub` keeps two providers from colliding (Keycloak sub "123" ≠ Google sub
 * "123") and means identity is NEVER keyed by email — two identities sharing
 * an email stay distinct users.
 */
export const internalUserId = (provider: string | undefined, sub: string): string =>
    provider ? `${provider}:${sub}` : sub;

/**
 * Turns an authenticated `Identity` into an authorized `Subject` — the CMS-side
 * authorization step, decoupled from any backend. Every backend does authn only
 * and feeds an `Identity` here; the role is resolved from `UsersRepository`,
 * keyed by `provider:sub`.
 *
 * Authorization is **per identity** (managed via the admin Users surface) — it
 * is never derived from claims or the email. A fresh identity defaults to
 * `defaultRole`; an existing one keeps its stored role.
 */
export class SubjectResolver<Role extends string = string> {

    constructor(
        private readonly users: UsersRepository<Role>,
        private readonly defaultRole: Role,
    ) {}

    /** Fresh login: record the identity under its `provider:sub` key, return the Subject. */
    async fromIdentity(identity: Identity): Promise<Subject<Role>> {
        const id = internalUserId(identity.provider, identity.sub);
        const user = await this.users.upsert({ ...identity, sub: id }, this.defaultRole);
        return toSubject(user);
    }

    /** Already-authenticated principal (session cookie / PAT). `null` when the
     *  `sub` is unknown — e.g. the user was deleted while a session is in flight. */
    async fromSub(sub: string): Promise<Subject<Role> | null> {
        const user = await this.users.getBySub(sub);
        return user ? toSubject(user) : null;
    }
}

function toSubject<Role extends string>(u: TUser<Role>): Subject<Role> {
    return { identifier: u.sub, role: u.role, displayName: u.displayName ?? u.sub };
}
