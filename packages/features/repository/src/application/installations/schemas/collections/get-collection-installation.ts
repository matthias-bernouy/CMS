import { z } from "zod";
import { contractString } from "@bernouy/ulvia-sdk";
export const getCollectionInstallationInputSchema = z.strictObject({
    collectionId: contractString({ minLength: 1, maxLength: 193 }),
});

export const getCollectionInstallationOutputSchema = z.strictObject({
    collectionId: contractString({ maxLength: 193 }),
    name: contractString({ maxLength: 300 }),
    description: contractString({ maxLength: 2000 }),
    publisherId: contractString({ maxLength: 96 }),
    version: contractString({ maxLength: 64 }),
    digest: contractString({ maxLength: 71 }),
    blocCount: z.int().min(0).max(1024),
    exampleCount: z.int().min(0).max(1024),
    assetCount: z.int().min(0).max(1024),
    textCount: z.int().min(0).max(4096),
    themeTokenCount: z.int().min(0).max(4096),
    configurable: z.boolean(),
    revision: z.int().min(0).max(9007199254740991),
    configurationJson: contractString({ maxLength: 1048576 }),
    overriddenLocaleCount: z.int().min(0).max(64),
    blocs: z
        .array(
            z.strictObject({
                id: contractString({ maxLength: 128 }),
                label: contractString({ maxLength: 300 }),
                description: contractString({ maxLength: 2000 }),
                catalogue: contractString({ maxLength: 6, enum: ["listed", "hidden"] }),
            }),
        )
        .max(1024)
        .readonly(),
    repositoryId: contractString({ maxLength: 96 }).optional(),
});

export const getCollectionDetailsOutputSchema = getCollectionInstallationOutputSchema.extend({
    textCount: z.int().min(0).max(8192),
    themeTokenCount: z.int().min(0).max(8192),
});
