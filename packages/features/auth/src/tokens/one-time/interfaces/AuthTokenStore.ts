export type AuthTokenPurpose = "email_verification" | "password_reset";

export type AuthToken = {
    id: string;
    purpose: AuthTokenPurpose;
    sub: string;
    createdAt: Date;
    expiresAt: Date;
    consumedAt: Date | null;
};

export type NewAuthToken = {
    purpose: AuthTokenPurpose;
    sub: string;
    expiresAt: Date;
};

export type AuthTokenReservation = {
    id: string;
    authToken: AuthToken;
    expiresAt: Date;
};

/**
 * Single-use token store for email verification and password reset flows.
 * Implementations must persist only a hash of the plaintext token.
 */
export interface AuthTokenStore {
    create(input: NewAuthToken): Promise<{ token: string; authToken: AuthToken }>;
    /** Latest unconsumed, unexpired token for a subject/purpose. Plaintext is
     *  intentionally unavailable; this is for cooldown decisions only. */
    findActive(purpose: AuthTokenPurpose, sub: string): Promise<AuthToken | null>;
    /** Atomically reserve a valid token for one exact protected mutation. A
     * retry may resume only that same operation after a crash or release. */
    reserve(purpose: AuthTokenPurpose, token: string, operation: string): Promise<AuthTokenReservation | null>;
    /** Mark the exact reservation consumed after the protected mutation commits. */
    finalize(reservationId: string): Promise<AuthToken | null>;
    /** Release a reservation when the protected mutation did not commit. */
    release(reservationId: string): Promise<boolean>;
    /** Compatibility one-shot operation for callers without an external mutation. */
    consume(purpose: AuthTokenPurpose, token: string): Promise<AuthToken | null>;
    deleteForSub(sub: string, purpose?: AuthTokenPurpose): Promise<number>;
}
