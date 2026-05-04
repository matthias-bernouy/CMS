import type { DefaultRole } from "@bernouy/core";

/**
 * A single API token record. The raw bearer string is NEVER stored — only
 * its SHA-256 hash. The snapshot of the owner's role is kept so that
 * `TokenAuthentication` can resolve a Subject on each request without
 * round-tripping to the identity provider.
 */
export type ApiToken<Role extends string = DefaultRole> = {
    /** Opaque identifier used in management routes (revoke form, URLs). */
    id: string;

    /** Stable subject identifier of the token owner (e.g. Keycloak `sub`). */
    ownerSub: string;

    /**
     * Role snapshot captured at token creation. If the owner's role changes
     * later in the identity provider, existing tokens keep the original role
     * until rotated. A `refresher` callback on `TokenAuthentication` can
     * override this behaviour when freshness matters.
     */
    ownerRole: Role;

    /** Human-friendly name of the owner at creation time, for display only. */
    ownerDisplayName?: string;

    /** Hex-encoded SHA-256 of the raw bearer string. */
    tokenHash: string;

    /** User-supplied label ("CI prod", "Migration script"), shown in UIs. */
    label: string;

    createdAt: Date;
    lastUsedAt?: Date;

    /** `undefined` means the token never expires. */
    expiresAt?: Date;

    /** Set to the revocation timestamp when the user revokes. Soft-delete. */
    revokedAt?: Date;
};

/**
 * Pluggable storage for API tokens. Implementations are free to use any
 * persistence layer (in-memory, SQL, MongoDB, etc.). Contracts:
 *
 * - `findByHash` MUST be indexed; it runs on every bearer-authenticated
 *   request and is the hot path.
 * - `create` MUST assign a fresh `id` and `createdAt`; implementations own
 *   the ID format (UUID, ObjectId, etc.).
 * - `revoke` MUST check ownership (`ownerSub`) and only affect non-revoked
 *   tokens; it returns `false` for any mismatch or already-revoked state.
 */
export interface ApiTokenRepository<Role extends string = DefaultRole> {
    findByHash(hash: string): Promise<ApiToken<Role> | null>;
    findByOwner(sub: string): Promise<ApiToken<Role>[]>;

    /**
     * Count of tokens for this owner that are neither revoked nor expired.
     * Used to enforce `maxTokensPerUser` on creation.
     */
    countActiveByOwner(sub: string): Promise<number>;

    create(token: Omit<ApiToken<Role>, "id" | "createdAt">): Promise<ApiToken<Role>>;

    /**
     * Soft-revokes the token. Returns `true` only if a matching,
     * non-revoked token owned by `ownerSub` was actually updated.
     */
    revoke(id: string, ownerSub: string): Promise<boolean>;

    /**
     * Updates `lastUsedAt` on the token. Callers use this fire-and-forget
     * on the hot path; implementations MAY batch or throttle writes.
     */
    touchLastUsed(id: string): Promise<void>;
}
