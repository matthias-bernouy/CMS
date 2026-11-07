import { normalizedSendEmailInputSchema } from "email/schemas/delivery";
import type { OutboundEmail } from "email/interfaces/Emailer";

/** Normalize wire data using the shared schemas, then adapt it to the delivery port. */
export function prepareOutboundEmail(value: unknown): OutboundEmail {
    const input = normalizedSendEmailInputSchema.parse(value);
    return {
        to: { email: input.toEmail, ...(input.toName === undefined ? {} : { displayName: input.toName }) },
        subject: input.subject,
        text: input.text,
        ...(input.html === undefined ? {} : { html: input.html }),
    };
}
