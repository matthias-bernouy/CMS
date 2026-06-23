export type AuthEmailRecipient = {
    email:        string;
    displayName?: string;
};

export type OutboundEmail = {
    to:       AuthEmailRecipient;
    subject:  string;
    text:     string;
    html?:    string;
};

/**
 * Outbound email transport boundary. Production runtimes can wire SMTP,
 * Resend, Mailgun, etc.; the message content is composed before this boundary.
 */
export interface Emailer {
    send(input: OutboundEmail): Promise<void>;
}
