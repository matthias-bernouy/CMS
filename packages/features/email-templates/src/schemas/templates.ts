import { contractString, z } from "@bernouy/ulvia-sdk";
import { contentSchema, idSchema, revisionSchema, valueSchema } from "./content";

export const identitySchema = z.strictObject({ id: idSchema });
const summarySchema = z.strictObject({
    id: idSchema,
    origin: z
        .strictObject({
            consumer: contractString({ minLength: 1, maxLength: 193 }),
            purpose: contractString({ minLength: 1, maxLength: 64 }),
        })
        .optional(),
    name: contractString({ minLength: 1, maxLength: 160 }),
    description: contractString({ maxLength: 1000 }),
    locale: contractString({ minLength: 2, maxLength: 35 }),
    revision: revisionSchema,
    archived: z.boolean(),
    latestVersion: z.number().int().min(0).max(Number.MAX_SAFE_INTEGER),
});
export const templateSchema = summarySchema.extend({ draft: contentSchema });
export const versionInputSchema = identitySchema.extend({
    version: z.number().int().min(1).max(Number.MAX_SAFE_INTEGER),
});
export const publicationSchema = versionInputSchema.extend({
    archived: z.boolean(),
    locale: contractString({ minLength: 2, maxLength: 35 }),
    content: contentSchema,
});
export const createInputSchema = z.strictObject({
    id: idSchema,
    name: summarySchema.shape.name,
    description: summarySchema.shape.description,
    locale: summarySchema.shape.locale,
    draft: contentSchema,
});
export const updateInputSchema = identitySchema.extend({
    expectedRevision: revisionSchema,
    name: summarySchema.shape.name,
    description: summarySchema.shape.description,
    draft: contentSchema,
});
export const mutationInputSchema = identitySchema.extend({ expectedRevision: revisionSchema });
export const listInputSchema = z.strictObject({
    after: idSchema.optional(),
    limit: z.number().int().min(1).max(100),
    includeArchived: z.boolean(),
});
export const listOutputSchema = z.strictObject({
    items: z.array(summarySchema).max(100),
    next: idSchema.optional(),
});
export const renderInputSchema = versionInputSchema.extend({ values: z.array(valueSchema).max(32) });
export const previewInputSchema = identitySchema.extend({
    expectedRevision: revisionSchema,
    values: z.array(valueSchema).max(32),
});
