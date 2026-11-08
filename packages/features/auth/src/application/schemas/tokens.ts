import { z } from "zod";
import { contractString } from "@bernouy/ulvia-sdk";
export const patMetadataSchema = z
    .strictObject({
        id: contractString({ minLength: 1, maxLength: 96 }),
        name: contractString({ minLength: 1, maxLength: 100 }),
        createdAt: contractString({ minLength: 1, maxLength: 40, format: "date-time" }),
        expiresAt: contractString({ minLength: 1, maxLength: 40, format: "date-time" }).nullable(),
        lastUsedAt: contractString({ minLength: 1, maxLength: 40, format: "date-time" }).optional(),
    })
    .readonly();

export const createPersonalAccessTokenInputSchema = z.strictObject({
    name: contractString({ minLength: 1, maxLength: 100 }),
    expiresAt: contractString({ minLength: 1, maxLength: 40, format: "date-time" }).nullable().optional(),
});

export const createPersonalAccessTokenOutputSchema = z
    .strictObject({
        token: contractString({ minLength: 1, maxLength: 47, sensitive: true }),
        metadata: patMetadataSchema,
    })
    .readonly();

export const revokePersonalAccessTokenInputSchema = z.strictObject({
    id: contractString({ minLength: 1, maxLength: 96 }),
});

export const revokePersonalAccessTokenOutputSchema = z
    .strictObject({
        revoked: z.boolean(),
    })
    .readonly();

export const listPersonalAccessTokensOutputSchema = z
    .strictObject({
        tokens: z.array(patMetadataSchema).min(0).max(32).readonly(),
    })
    .readonly();
