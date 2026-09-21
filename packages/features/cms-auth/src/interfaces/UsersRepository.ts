/**
 * CMS-owned membership store, keyed by `sub` (the stable opaque identity from
 * the auth provider). One row per identity the CMS has ever seen.
 *
 * This store records the CMS membership associated with identities returned by
 * authentication providers. Authorization belongs to views and is not stored
 * on the user record.
 *
 * The same rows are the back-office member list (`list`), so listing is
 * always available regardless of what the auth backend can do — it never has
 * to expose its own directory.
 *
 */

/** Authn output: identity only, never a role. Shared with the auth backends. */
export type Identity = {
    sub: string; // stable, opaque; primary key
    email?: string;
    /** Which provider authenticated this identity (e.g. "local", "google").
     *  Provenance only — NOT authz. Set by the auth backend. */
    provider?: string;
};

export type TUser = Identity & {
    createdAt: Date;
    lastSeenAt: Date;
};

export type UsersListOptions = {
    /** Exact, case-insensitive email match. PII is encrypted at rest (only a
     *  blind index exists), so substring search and email sorting are not
     *  possible — both implementations honor this. */
    search?: string;
    sortBy?: "createdAt" | "lastSeenAt";
    sortOrder?: "asc" | "desc";
    /** 1-based. Omit for the full (unbounded) listing. */
    pagination?: { page: number; limit: number };
};

export type UsersPage = {
    users: TUser[];
    total: number;
    page: number;
    limit: number;
    hasMore: boolean;
};

export interface UsersRepository {
    /** Login hook: create the member if `sub` is new, otherwise refresh its profile. */
    upsert(identity: Identity): Promise<TUser>;

    /** Membership lookup. `null` when `sub` is unknown. */
    getBySub(sub: string): Promise<TUser | null>;

    /** Remove a user from the CMS membership. Does NOT touch any auth
     *  backend / credential store. `false` when `sub` is unknown. */
    delete(sub: string): Promise<boolean>;

    /** The back-office member list — filtered / sorted / paged. */
    list(opts?: UsersListOptions): Promise<UsersPage>;
}
