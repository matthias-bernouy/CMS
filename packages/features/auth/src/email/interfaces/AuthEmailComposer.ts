import type { EmailRecipient, OutboundEmail } from "@bernouy/email";

export type AuthEmailKind = "email_verification" | "password_reset";

export type AuthEmailComposeInput = {
    kind: AuthEmailKind;
    to: EmailRecipient;
    actionUrl: string;
    token: string;
    expiresAt: Date;
    siteName?: string;
};

/**
 * Injected account email content builder. The official runtime composes exact
 * publications through the selected Email Templates capability.
 */
export interface AuthEmailComposer {
    compose(input: AuthEmailComposeInput): Promise<OutboundEmail>;
}
