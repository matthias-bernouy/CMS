export type AuthEmailRecipient = {
    email: string;
    displayName?: string;
};

export type OutboundEmail = {
    to: AuthEmailRecipient;
    subject: string;
    text: string;
    html?: string;
};

/**
 * Outbound email transport boundary. Production runtimes can wire SMTP,
 * Resend, Mailgun, etc.; the message content is composed before this boundary.
 */
export interface Emailer {
    /** Runtime capability check. Missing means enabled; transports without
     *  runtime settings do not need to implement it. */
    isEnabled?(): Promise<boolean>;
    send(input: OutboundEmail): Promise<void>;
}
