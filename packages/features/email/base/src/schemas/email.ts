import { z } from "zod";
import { contractString } from "@bernouy/ulvia-sdk";

export const emailRecipientSchema = z.strictObject({
    email: contractString({ format: "email", maxLength: 320 }),
    displayName: contractString({ maxLength: 160 }).optional(),
});

export const emailContentSchema = z.strictObject({
    subject: contractString({ minLength: 1, maxLength: 998 }),
    text: contractString({ minLength: 1, maxLength: 1048576 }),
    html: contractString({ minLength: 1, maxLength: 1048576 }).optional(),
});

export const outboundEmailSchema = z.strictObject({ to: emailRecipientSchema, ...emailContentSchema.shape });
