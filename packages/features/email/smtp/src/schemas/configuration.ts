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
