export type AuthTokenPurpose = "email_verification" | "password_reset";

export type AuthToken = {
    id:         string;
    purpose:    AuthTokenPurpose;
    sub:        string;
    createdAt:  Date;
    expiresAt:  Date;
    consumedAt: Date | null;
};

export type NewAuthToken = {
    purpose:   AuthTokenPurpose;
    sub:       string;
    expiresAt: Date;
};

/**
 * Single-use token store for email verification and password reset flows.
 * Implementations must persist only a hash of the plaintext token.
 */
export interface AuthTokenStore {
    create(input: NewAuthToken): Promise<{ token: string; authToken: AuthToken }>;
    consume(purpose: AuthTokenPurpose, token: string): Promise<AuthToken | null>;
    deleteForSub(sub: string, purpose?: AuthTokenPurpose): Promise<number>;
}
