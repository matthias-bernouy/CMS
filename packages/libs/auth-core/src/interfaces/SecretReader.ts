/**
 * Narrow read-only shape consumed by `OidcAuthentication` to resolve the
 * `clientSecretRef` of an `IdentityProvider` row at OIDC-callback time. The
 * full admin-side `SecretStore` interface (with `set`/`delete`/`listKeys`/etc.)
 * lives in the consumer — e.g. the host `SecretStore` interface. Keeping the
 * read shape minimal here decouples auth-core from the rest of the
 * secret-store contract, which is content-management territory.
 */
export interface SecretReader {
    /** Returns the raw value, or `null` when the key isn't set. */
    get(key: string): Promise<string | null>;
}
