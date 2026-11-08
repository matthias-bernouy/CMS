import { z } from "zod";
import { contractString } from "@bernouy/ulvia-sdk";
export const planCollectionUpgradeInputSchema = z.strictObject({
    targets: z
        .array(
            z.strictObject({
                repositoryId: contractString({ minLength: 1, maxLength: 96 }),
                publisherId: contractString({ minLength: 1, maxLength: 96 }),
                collectionId: contractString({ minLength: 1, maxLength: 193 }),
                version: contractString({ minLength: 1, maxLength: 64 }),
                digest: contractString({ maxLength: 71 }),
                approvedBrowserRiskDigest: contractString({ maxLength: 71 }),
                configurationJson: contractString({ maxLength: 1048576 }).optional(),
                textOverridesJson: contractString({ maxLength: 1048576 }).optional(),
            }),
        )
        .min(1)
        .max(256)
        .readonly(),
});

export const planCollectionUpgradeOutputSchema = z.strictObject({
    expectedRevision: z.int().min(0).max(9007199254740991),
    planDigest: contractString({ maxLength: 71 }),
    status: contractString({ maxLength: 16, enum: ["applicable", "blocked", "incomplete"] }),
    issueCount: z.int().min(0).max(9007199254740991),
    issues: z
        .array(
            z.strictObject({
                code: contractString({ maxLength: 48 }),
                location: contractString({ maxLength: 4096 }),
                message: contractString({ maxLength: 4096 }),
                replacement: contractString({ maxLength: 512 }).optional(),
            }),
        )
        .max(1024)
        .readonly(),
    resources: z
        .array(
            z.strictObject({
                collectionId: contractString({ maxLength: 193 }),
                kind: contractString({ maxLength: 32 }),
                id: contractString({ maxLength: 512 }),
                change: contractString({ maxLength: 16, enum: ["added", "removed", "deprecated"] }),
                replacement: contractString({ maxLength: 512 }).optional(),
            }),
        )
        .max(4096)
        .readonly(),
    references: z
        .array(
            z.strictObject({
                repositoryId: contractString({ minLength: 1, maxLength: 96 }),
                publisherId: contractString({ minLength: 1, maxLength: 96 }),
                collectionId: contractString({ minLength: 1, maxLength: 193 }),
                version: contractString({ minLength: 1, maxLength: 64 }),
                digest: contractString({ maxLength: 71 }),
                approvedBrowserRiskDigest: contractString({ maxLength: 71 }),
                configurationJson: contractString({ maxLength: 1048576 }).optional(),
                textOverridesJson: contractString({ maxLength: 1048576 }).optional(),
            }),
        )
        .min(1)
        .max(256)
        .readonly(),
    source: z
        .array(
            z.strictObject({
                collectionId: contractString({ maxLength: 193 }),
                version: contractString({ maxLength: 64 }),
                digest: contractString({ maxLength: 71 }),
            }),
        )
        .max(256)
        .readonly(),
    resourceCount: z.int().min(0).max(9007199254740991),
    usageDigest: contractString({ maxLength: 71 }),
});
