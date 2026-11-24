import { z } from "zod";
import { contractString } from "ulvia-sdk/schema/adapters";
const id = contractString({ minLength: 1, maxLength: 128 });
export const schemaSelectorSchema = z.strictObject({
    selectorJson: contractString({ maxLength: 16384, sensitive: true }),
    version: id.optional(),
});
export const schemaDescriptorSchema = z.strictObject({
    resourceId: id,
    version: id,
    schemaJson: contractString({ maxLength: 262144 }),
    digest: contractString({ minLength: 71, maxLength: 71 }),
    fields: z
        .array(
            z.strictObject({
                id: contractString({ minLength: 1, maxLength: 64 }),
                property: contractString({ minLength: 1, maxLength: 64 }),
                label: contractString({ minLength: 1, maxLength: 65536 }),
                sensitive: z.boolean(),
            }),
        )
        .max(8192)
        .readonly(),
});

export const schemaChoicesInputSchema = z.strictObject({
    cursor: contractString({ maxLength: 2048 }).optional(),
    limit: z.int().min(1).max(100),
});
export const schemaChoicesOutputSchema = z.strictObject({
    items: z
        .array(
            z.strictObject({
                selectorJson: contractString({ maxLength: 16384, sensitive: true }),
                label: contractString({ maxLength: 512 }),
                available: z.boolean(),
            }),
        )
        .max(100)
        .readonly(),
    nextCursor: contractString({ maxLength: 2048 }).optional(),
});
export type SchemaChoices = z.output<typeof schemaChoicesOutputSchema>;
