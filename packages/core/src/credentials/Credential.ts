/**
 * Persisted bearer credential. Only the SHA-256 hash of the cleartext token
 * is stored — the cleartext is returned exactly once at creation and never
 * reconstructible afterwards. Credentials may be revoked or expire.
 *
 * Consumers extend this type to attach their own scope (e.g. `bucketId`,
 * `tenantId`); core does not assume any.
 */
export type Credential = {
    id: string;
    /** Hex-encoded SHA-256 of the cleartext bearer token (see `sha256Hex`). */
    tokenHash: string;
    label?: string;
    createdAt: Date;
    expiresAt?: Date;
    revokedAt?: Date;
};
