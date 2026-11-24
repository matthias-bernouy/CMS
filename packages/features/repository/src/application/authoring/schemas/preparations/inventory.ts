import { z } from "zod";
import { contractString } from "@bernouy/ulvia-sdk";

export const preparationQuotaSchema = z.strictObject({
    limit: z.int().min(1),
    count: z.int().min(0),
    listCapability: contractString({ enum: ["list-preparations"], maxLength: 32 }),
    discardCapability: contractString({ enum: ["discard-preparation"], maxLength: 32 }),
});

export const preparationInventoryInputSchema = z.strictObject({
    cursor: contractString({ minLength: 36, maxLength: 36 }).optional(),
    limit: z.int().min(1).max(8).optional(),
});

export const preparationInventorySchema = z.strictObject({
    items: z
        .array(
            z.strictObject({
                preparationId: contractString({ minLength: 36, maxLength: 36 }),
                kind: contractString({
                    enum: ["collection", "contract", "provider-manifest", "workflow"],
                    maxLength: 17,
                }).nullable(),
                resourceId: contractString({ minLength: 1, maxLength: 225 }).nullable(),
                version: contractString({ minLength: 1, maxLength: 64 }).nullable(),
                expiresAt: contractString({ format: "date-time", maxLength: 64 }),
                publicationState: contractString({
                    enum: ["not-recorded", "sources-pending", "published", "unreadable"],
                    maxLength: 16,
                }),
            }),
        )
        .max(8),
    nextCursor: contractString({ maxLength: 36 }).nullable(),
    quota: z.strictObject({
        limit: z.int().min(1),
        count: z.int().min(0),
        inProgress: z.int().min(0),
    }),
});
