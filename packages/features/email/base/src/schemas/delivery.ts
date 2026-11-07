import { z } from "zod";
import { emailRecipientSchema, emailContentSchema } from "email/schemas/email";

export const sendEmailInputSchema = z.strictObject({
    toEmail: emailRecipientSchema.shape.email,
    toName: emailRecipientSchema.shape.displayName,
    ...emailContentSchema.shape,
});

export const sendEmailOutputSchema = z.strictObject({ sent: z.boolean() });

// Internal normalization adds business preparation without changing the published v1 input schema.
const nonBlankText = z.string().trim().min(1);
export const normalizedSendEmailInputSchema = sendEmailInputSchema.extend({
    toEmail: sendEmailInputSchema.shape.toEmail.pipe(nonBlankText),
    subject: sendEmailInputSchema.shape.subject.pipe(nonBlankText),
    text: sendEmailInputSchema.shape.text.pipe(nonBlankText),
    html: sendEmailInputSchema.shape.html.unwrap().pipe(nonBlankText).optional(),
});
