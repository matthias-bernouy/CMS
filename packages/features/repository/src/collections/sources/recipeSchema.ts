import { z } from "zod";
import { contractString } from "@bernouy/ulvia-sdk";

export const recipeCatalogueInputSchema = z.strictObject({
    limit: z.int().min(1).max(64),
    cursor: contractString({ maxLength: 256 }).optional(),
    locale: contractString({ maxLength: 64 }).optional(),
});

export const recipeCatalogueOutputSchema = z.strictObject({
    items: z
        .array(
            z.strictObject({
                root: z.strictObject({
                    publisherId: contractString({ maxLength: 96 }),
                    collectionId: contractString({ maxLength: 193 }),
                    version: contractString({ maxLength: 64 }),
                    digest: contractString({ maxLength: 71 }),
                    bootstrapId: contractString({ maxLength: 96 }),
                }),
                label: contractString({ maxLength: 16384 }),
                description: contractString({ maxLength: 16384 }),
                pageCount: z.int().min(0).max(Number.MAX_SAFE_INTEGER),
                includeCount: z.int().min(0).max(Number.MAX_SAFE_INTEGER),
            }),
        )
        .max(64),
    cursor: contractString({ maxLength: 256 }),
});

export type RecipeCatalogueInput = z.output<typeof recipeCatalogueInputSchema>;
export type RecipeCatalogueOutput = z.output<typeof recipeCatalogueOutputSchema>;
