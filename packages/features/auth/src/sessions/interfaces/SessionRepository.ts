export interface SessionRecord {
    readonly tokenHash: string;
    readonly sub: string;
    readonly createdAt: Date;
    readonly lastActivityAt: Date;
    readonly idleExpiresAt: Date;
    readonly absoluteExpiresAt: Date;
}

/** Instance-scoped storage. Touch and revocation never upsert a session. */
export interface SessionRepository {
    /** Retain the newest bounded set. Refuse proofs started before account-wide revocation. */
    create(session: SessionRecord, authenticatedAt: Date): Promise<boolean>;
    touch(tokenHash: string, now: Date, idleTimeoutMs: number): Promise<SessionRecord | null>;
    revoke(tokenHash: string): Promise<void>;
    revokeForSub(sub: string, now: Date): Promise<void>;
}
