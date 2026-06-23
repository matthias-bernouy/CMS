export type AuthEmailRecipient = {
    email:        string;
    displayName?: string;
};

export type EmailVerificationEmail = {
    to:              AuthEmailRecipient;
    verificationUrl: string;
    expiresAt:       Date;
};

export type PasswordResetEmail = {
    to:        AuthEmailRecipient;
    resetUrl:  string;
    expiresAt: Date;
};

/**
 * Outbound auth email boundary. Production runtimes can wire SMTP, Resend,
 * Mailgun, etc.; tests and dev can wire in-memory or console implementations.
 */
export interface Emailer {
    sendEmailVerification(input: EmailVerificationEmail): Promise<void>;
    sendPasswordReset(input: PasswordResetEmail): Promise<void>;
}
