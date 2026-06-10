/**
 * CMS-owned membership store, keyed by `sub` (the stable opaque identity from
 * the auth provider). One row per identity the CMS has ever seen.
 *
 * This is the boundary between authentication and authorization:
 *   - The auth provider does authn only — it yields an `Identity` (NO role).
 *   - The CMS does authz — this store assigns the role and is the sole source
 *     of truth for "what may this identity do". Guards read the role from here,
 *     never from the provider.
 *
 * The same rows are the user list shown to admins (`list`), so listing is
 * always available regardless of what the auth backend can do — it never has
 * to expose its own directory.
 *
 * Role granting is a server-side act: `upsert` only sets a role on first
 * insert (via `defaultRole`) and `setRole` is the explicit, admin-gated path.
 * A role is never derived from anything the user controls.
 */

/** Authn output: identity only, never a role. Shared with the auth backends. */
export type Identity = {
    sub:          string;            // stable, opaque; primary key
    displayName?: string;
    email?:       string;
    /** Which provider authenticated this identity (e.g. "local", "google").
     *  Provenance only — NOT authz. Set by the auth backend. */
    provider?:    string;
};

export type TUser<Role extends string = string> = Identity & {
    role:       Role;
    createdAt:  Date;
    lastSeenAt: Date;
};

export type UsersListOptions = {
    /** Exact, case-insensitive email match. PII is encrypted at rest (only a
     *  blind index exists), so substring search and sorting on email /
     *  displayName are NOT possible — both impls honor this. */
    search?:     string;
    /** Exact role filter. */
    role?:       string;
    sortBy?:     "createdAt" | "lastSeenAt";
    sortOrder?:  "asc" | "desc";
    /** 1-based. Omit for the full (unbounded) listing. */
    pagination?: { page: number; limit: number };
};

export type UsersPage<Role extends string = string> = {
    users:   TUser<Role>[];
    total:   number;
    page:    number;
    limit:   number;
    hasMore: boolean;
};

export interface UsersRepository<Role extends string = string> {

    /** Login hook: create the user with `defaultRole` if `sub` is new, else
     *  refresh its profile + `lastSeenAt` and KEEP its existing role. */
    upsert(identity: Identity, defaultRole: Role): Promise<TUser<Role>>;

    /** Role resolution for authz. `null` when `sub` is unknown. */
    getBySub(sub: string): Promise<TUser<Role> | null>;

    /** The explicit, server-side role grant/revoke. `null` when `sub` is unknown. */
    setRole(sub: string, role: Role): Promise<TUser<Role> | null>;

    /** Update mutable profile fields (admin self-service profile edit). Only
     *  touches the fields present in `patch`; leaves role and `lastSeenAt`
     *  alone (it is NOT a login). `null` when `sub` is unknown. */
    setProfile(sub: string, patch: { displayName?: string }): Promise<TUser<Role> | null>;

    /** Remove a user from the CMS membership (authz). Does NOT touch any auth
     *  backend / credential store. `false` when `sub` is unknown. */
    delete(sub: string): Promise<boolean>;

    /** The admin user list — filtered / sorted / paged. */
    list(opts?: UsersListOptions): Promise<UsersPage<Role>>;
}
