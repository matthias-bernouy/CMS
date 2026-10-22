export type EmailRecipient = Readonly<{
    email: string;
    displayName?: string;
}>;

export type OutboundEmail = Readonly<{
    to: EmailRecipient;
    subject: string;
    text: string;
    html?: string;
}>;

/** Outbound delivery port consumed by features that author email messages. */
export interface Emailer {
    isEnabled(): Promise<boolean>;
    send(input: OutboundEmail): Promise<void>;
}
