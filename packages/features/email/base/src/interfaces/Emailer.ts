import type { z } from "@bernouy/ulvia-sdk";
import type { emailRecipientSchema, outboundEmailSchema } from "email/schemas/email";

export type EmailRecipient = Readonly<z.output<typeof emailRecipientSchema>>;
export type OutboundEmail = Readonly<z.output<typeof outboundEmailSchema>> & Readonly<{ to: EmailRecipient }>;

/** Outbound delivery port consumed by features that author email messages. */
export interface Emailer {
    isEnabled(): Promise<boolean>;
    send(input: OutboundEmail): Promise<void>;
}
