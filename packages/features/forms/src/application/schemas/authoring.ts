import { contractString, z } from "@bernouy/ulvia-sdk";
import { fieldsSchema } from "forms/application/schemas/fields";

export const uuidSchema = contractString({ format: "uuid", maxLength: 36 });
export const revisionSchema = z.int().min(1).max(Number.MAX_SAFE_INTEGER);
export const accessModeSchema = contractString({ enum: ["public", "authenticated"] as const, maxLength: 13 });
const availabilitySchema = contractString({ enum: ["closed", "open", "archived"] as const, maxLength: 8 });
export const draftSchema = z.strictObject({
    title: contractString({ minLength: 1, maxLength: 65536 }),
    locale: contractString({ minLength: 1, maxLength: 65536 }),
    description: contractString({ maxLength: 65536 }).optional(),
    accessMode: accessModeSchema,
    fields: fieldsSchema,
    retentionDays: z.int().min(1).max(Number.MAX_SAFE_INTEGER),
    opensAt: contractString({ maxLength: 24 }).optional(),
    closesAt: contractString({ maxLength: 24 }).optional(),
    messages: z.strictObject({
        success: contractString({ maxLength: 65536 }),
        closed: contractString({ maxLength: 65536 }),
    }),
});
export const formSchema = z.strictObject({
    id: uuidSchema,
    revision: revisionSchema,
    availability: availabilitySchema,
    draft: draftSchema,
    currentVersion: revisionSchema.optional(),
});
export const versionSchema = z.strictObject({ formId: uuidSchema, version: revisionSchema, draft: draftSchema });
export const createAckSchema = z.strictObject({ formId: uuidSchema, revision: revisionSchema });
export const publishAckSchema = z.strictObject({
    formId: uuidSchema,
    version: revisionSchema,
    revision: revisionSchema,
});
export type PublishAck = z.infer<typeof publishAckSchema>;
export const createInputSchema = z.strictObject({ formId: uuidSchema, draft: draftSchema });
export const getInputSchema = z.strictObject({ formId: uuidSchema, version: revisionSchema.optional() });
export const getOutputSchema = formSchema.extend({ publishedVersion: versionSchema.optional() });
export const listInputSchema = z.strictObject({
    limit: z.int().min(1).max(100),
    after: contractString({ minLength: 1, maxLength: 2048 }).optional(),
});
const formSummarySchema = z.strictObject({
    id: uuidSchema,
    title: contractString({ minLength: 1, maxLength: 65536 }),
    revision: revisionSchema,
    availability: availabilitySchema,
    currentVersion: revisionSchema.optional(),
});
export const listOutputSchema = z.strictObject({
    forms: z.array(formSummarySchema).max(100),
    next: contractString({ minLength: 1, maxLength: 2048 }).optional(),
});
export const updateInputSchema = z.strictObject({
    formId: uuidSchema,
    expectedRevision: revisionSchema,
    draft: draftSchema,
});
export const casInputSchema = z.strictObject({ formId: uuidSchema, expectedRevision: revisionSchema });
export const availabilityInputSchema = z.strictObject({
    formId: uuidSchema,
    expectedRevision: revisionSchema,
    availability: contractString({ enum: ["closed", "open"] as const, maxLength: 6 }),
});
export type FormDraft = z.infer<typeof draftSchema>;
export type FormRecord = z.infer<typeof formSchema>;
export type FormVersion = z.infer<typeof versionSchema>;
export type CreateInput = z.infer<typeof createInputSchema>;
export type ListInput = z.infer<typeof listInputSchema>;
export type ListOutput = z.infer<typeof listOutputSchema>;
export type UpdateInput = z.infer<typeof updateInputSchema>;
export type CasInput = z.infer<typeof casInputSchema>;
export type AvailabilityInput = z.infer<typeof availabilityInputSchema>;
