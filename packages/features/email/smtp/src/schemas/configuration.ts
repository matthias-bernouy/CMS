import { z } from "zod";
import { contractString } from "@bernouy/ulvia-sdk";

const smtpConnectionSchema = z.strictObject({
    host: contractString({ maxLength: 253 }),
    port: z.int().min(1).max(65535),
    secure: z.boolean(),
    username: contractString({ maxLength: 320 }),
});

const emailerConfigurationSchema = z.strictObject({
    enabled: z.boolean(),
    fromEmail: contractString({ maxLength: 320 }),
    fromName: contractString({ maxLength: 160 }),
    replyTo: contractString({ maxLength: 320 }),
});

export const smtpConfigurationSchema = emailerConfigurationSchema.extend({
    smtp: smtpConnectionSchema.extend({ passwordConfigured: z.boolean() }),
});

export const smtpConfigurationUpdateSchema = emailerConfigurationSchema.extend({
    smtp: smtpConnectionSchema.extend({
        password: contractString({ sensitive: true, minLength: 1, maxLength: 4096 }).optional(),
    }),
});

export const storedSmtpConfigurationSchema = emailerConfigurationSchema.extend({
    smtp: smtpConnectionSchema.extend({ password: contractString({ maxLength: 4096 }) }),
});

export const getSmtpConfigurationInputSchema = z.strictObject({});

// These internal schemas normalize and validate business state; published schemas remain unchanged.
export const normalizedSmtpConfigurationUpdateSchema = smtpConfigurationUpdateSchema.extend({
    smtp: smtpConfigurationUpdateSchema.shape.smtp.extend({
        password: smtpConfigurationUpdateSchema.shape.smtp.shape.password
            .unwrap()
            .pipe(z.string().trim().min(1))
            .optional(),
    }),
});
const enabledEmail = z.string().regex(/^[^\s@]+@[^\s@]+\.[^\s@]+$/u);
export const normalizedStoredSmtpConfigurationSchema = storedSmtpConfigurationSchema
    .transform((input) => ({
        ...input,
        fromEmail: input.fromEmail.trim(),
        fromName: input.fromName.trim(),
        replyTo: input.replyTo.trim(),
        smtp: { ...input.smtp, host: input.smtp.host.trim(), username: input.smtp.username.trim() },
    }))
    .superRefine((input, context) => {
        if (!input.enabled) {
            return;
        }
        if (!enabledEmail.safeParse(input.fromEmail).success) {
            context.addIssue({ code: "custom", path: ["fromEmail"], message: "smtp.sender" });
        } else if (input.replyTo && !enabledEmail.safeParse(input.replyTo).success) {
            context.addIssue({ code: "custom", path: ["replyTo"], message: "smtp.reply" });
        } else if (!input.smtp.host || !input.smtp.username || !input.smtp.password) {
            context.addIssue({ code: "custom", path: ["smtp"], message: "smtp.credentials" });
        }
    });
