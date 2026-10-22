import type { EmailRecipient, OutboundEmail } from "@bernouy/cms-emailer";

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
 * Auth email content builder. The default implementation ships simple
 * email-safe text/html; Settings can later provide a stored-template composer.
 */
export interface AuthEmailComposer {
    compose(input: AuthEmailComposeInput): Promise<OutboundEmail>;
}
