/**
 * A single outbound email message.
 */
export type MailMessage = {
    to: string;
    subject: string;
    html: string;
    text?: string;
    /** Overrides the provider's default "from" address. */
    from?: string;
};

/**
 * Contract for sending transactional email on behalf of the Be5 platform.
 *
 * The Authentication provider consumes this optionally: features that need
 * to email the user (password reset, etc.) are disabled when no mailer is
 * supplied.
 */
export interface Mailer {
    send(message: MailMessage): Promise<void>;
}
