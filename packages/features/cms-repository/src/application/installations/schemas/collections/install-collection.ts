import { z } from "zod";
import { contractString } from "@bernouy/ulvia-sdk";
export const installCollectionInputSchema = z.strictObject({
    expectedRevision: z
        .int()
        .min(0)
        .max(9007199254740991)
        .describe("Current revision returned by the corresponding read operation. Read again after a conflict."),
    targets: z
        .array(
            z.strictObject({
                repositoryId: contractString({ minLength: 1, maxLength: 96 }),
                publisherId: contractString({ minLength: 1, maxLength: 96 }),
                collectionId: contractString({ minLength: 1, maxLength: 193 }),
                version: contractString({ minLength: 1, maxLength: 64 }),
                digest: contractString({ maxLength: 71 }),
                approvedBrowserRiskDigest: contractString({ maxLength: 71 }),
            }),
        )
        .min(1)
        .max(256)
        .readonly(),
});

export const installCollectionOutputSchema = z.strictObject({
    revision: z.int().min(0).max(9007199254740991),
    items: z
        .array(
            z.strictObject({
                collectionId: contractString({ maxLength: 193 }),
                publisherId: contractString({ maxLength: 96 }),
                version: contractString({ maxLength: 64 }),
                digest: contractString({ maxLength: 71 }),
                blocCount: z.int().min(0).max(1024),
                exampleCount: z.int().min(0).max(1024),
                assetCount: z.int().min(0).max(1024),
                textCount: z.int().min(0).max(4096),
                themeTokenCount: z.int().min(0).max(4096),
                configurable: z.boolean(),
                repositoryId: contractString({ maxLength: 96 }).optional(),
            }),
        )
        .max(256)
        .readonly(),
});
