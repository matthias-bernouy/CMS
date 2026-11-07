import { z } from "zod";
import { emailRecipientSchema, emailContentSchema } from "email/schemas/email";

export const sendEmailInputSchema = z.strictObject({
    toEmail: emailRecipientSchema.shape.email,
    toName: emailRecipientSchema.shape.displayName,
    ...emailContentSchema.shape,
});

export const sendEmailOutputSchema = z.strictObject({ sent: z.boolean() });
