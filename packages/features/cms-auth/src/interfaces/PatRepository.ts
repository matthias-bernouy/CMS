/**
 * Personal Access Tokens — CMS-issued, CMS-verified bearer tokens bound to a
 * `sub`. The provider-agnostic CLI / server-to-server-as-a-user mechanism:
 * works no matter how the user logged in, and survives a change of login
 * provider. The plaintext token is returned ONCE at creation; only its hash is
 * stored, so it is unrecoverable and cheaply revocable (delete the row).
 *
 * This is an AUTHENTICATION-secret store (hashes, expiry, revocation) — a
 * separate lifecycle from `UsersRepository` (authz roles). They link by `sub`.
 *
 * NOTE: verifying an EXTERNAL IdP's bearer JWT is a different path (JWKS +
 * issuer-allowlist, the `_sdk` model) — not this store.
 */
export type Pat = {
    id:          string;           // opaque record id — for listing / revoking
    sub:         string;           // the user this token authenticates as
    name:        string;           // human label ("my laptop CLI")
    scopes:      string[];         // empty = full user scope
    createdAt:   Date;
    lastUsedAt?: Date;
    expiresAt?:  Date | null;      // null = never expires
};

/** A successful verification — enough to resolve a `Subject` via `fromSub`. */
export type PatPrincipal = { sub: string; scopes: string[] };

export type NewPat = { sub: string; name: string; scopes?: string[]; expiresAt?: Date | null };

export interface PatRepository {
    /** Mint a token. Returns the one-time plaintext `token` + its stored record. */
    create(input: NewPat): Promise<{ token: string; pat: Pat }>;
    /** Verify a presented token: hash-match + not expired + not revoked. `null`
     *  otherwise. Bumps `lastUsedAt` on success. */
    verify(token: string): Promise<PatPrincipal | null>;
    /** A user's tokens (no secrets) — for the "Access tokens" admin panel. */
    list(sub: string): Promise<Pat[]>;
    /** Revoke one of a user's tokens by record id. `false` when unknown or not owned by `sub`. */
    revoke(sub: string, id: string): Promise<boolean>;
}
