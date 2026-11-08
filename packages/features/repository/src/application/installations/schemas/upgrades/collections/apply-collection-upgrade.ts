import { z } from "zod";
import { contractString } from "@bernouy/ulvia-sdk";
export const applyCollectionUpgradeInputSchema = z.strictObject({
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
    planDigest: contractString({ maxLength: 71 }),
});

export const applyCollectionUpgradeOutputSchema = z.strictObject({
    upgradeId: contractString({ maxLength: 71 }),
    status: contractString({ maxLength: 16, enum: ["prepared", "applying", "completed", "cancelled"] }),
    collectionRevision: z.int().min(0).max(9007199254740991),
});
