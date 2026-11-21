import { contractString, z } from "@bernouy/ulvia-sdk";

const bindingSchema = z.strictObject({
    id: contractString({ format: "uuid", maxLength: 36 }),
    version: z.number().int().min(1).max(32),
    source: contractString({ minLength: 1, maxLength: 256 }),
});
export const accountEmailConfigurationSchema = z.strictObject({
    revision: z.number().int().min(1).max(Number.MAX_SAFE_INTEGER),
    emailVerification: bindingSchema,
    passwordReset: bindingSchema,
});
export const updateAccountEmailsSchema = z.strictObject({
    expectedRevision: z.number().int().min(1).max(Number.MAX_SAFE_INTEGER),
    emailVerification: bindingSchema,
    passwordReset: bindingSchema,
});
export type AccountEmailConfiguration = z.infer<typeof accountEmailConfigurationSchema>;
export type AccountEmailBinding = z.infer<typeof bindingSchema>;

export const accountEmailConfigurationViewSchema = accountEmailConfigurationSchema.extend({
    selectedSource: contractString({ minLength: 1, maxLength: 256 }).optional(),
});
