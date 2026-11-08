import { z } from "zod";
import { contractString } from "@bernouy/ulvia-sdk";
export const namespaceInventoryInputSchema = z.strictObject({
    cursor: contractString({ maxLength: 96 }).optional(),
    limit: z.int().min(1).max(32).optional(),
    namespace: contractString({ minLength: 1, maxLength: 96 }).optional(),
});

export const namespaceInventorySchema = z
    .strictObject({
        items: z
            .array(
                z
                    .strictObject({
                        namespace: contractString({ minLength: 1, maxLength: 96 }),
                        repositoryId: contractString({ maxLength: 128 }),
                        access: contractString({ enum: ["owned", "suspended"], maxLength: 16 }),
                        revision: z.int().min(1),
                        checkedAt: contractString({ maxLength: 64, format: "date-time" }),
                    })
                    .readonly(),
            )
            .max(32)
            .readonly(),
        nextCursor: contractString({ maxLength: 96 }).nullable(),
    })
    .readonly();

export const claimedNamespaceSchema = z
    .strictObject({
        namespace: contractString({ minLength: 1, maxLength: 96 }),
        revision: z.int().min(1),
        state: contractString({ minLength: 1, maxLength: 16, enum: ["active", "suspended"] }),
        updatedAt: contractString({ minLength: 1, maxLength: 64, format: "date-time" }),
    })
    .readonly();

export const claimNamespaceInputSchema = z.strictObject({
    namespace: contractString({ maxLength: 96 }),
});
