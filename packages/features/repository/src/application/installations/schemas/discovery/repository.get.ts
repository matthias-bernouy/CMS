import { z } from "zod";
import { contractString } from "@bernouy/ulvia-sdk";
export const repositoryGetInputSchema = z.strictObject({
    repositoryId: contractString({ minLength: 1, maxLength: 96 }),
    reference: z.strictObject({
        kind: contractString({
            minLength: 1,
            maxLength: 32,
            enum: ["collection", "contract", "provider-manifest"],
        }),
        publisherId: contractString({ minLength: 1, maxLength: 96 }),
        id: contractString({ minLength: 1, maxLength: 193 }),
        version: contractString({ minLength: 1, maxLength: 128 }),
        digest: contractString({ minLength: 1, maxLength: 71 }),
    }),
    blocId: contractString({ minLength: 1, maxLength: 512 }).optional(),
    exampleId: contractString({ minLength: 1, maxLength: 128 }).optional(),
    offset: z.int().min(0).max(8388608).optional(),
    limit: z.int().min(1).max(16000).optional(),
});

export const repositoryGetOutputSchema = z.strictObject({
    reference: z.strictObject({
        kind: contractString({
            minLength: 1,
            maxLength: 32,
            enum: ["collection", "contract", "provider-manifest"],
        }),
        publisherId: contractString({ minLength: 1, maxLength: 96 }),
        id: contractString({ minLength: 1, maxLength: 193 }),
        version: contractString({ minLength: 1, maxLength: 128 }),
        digest: contractString({ minLength: 1, maxLength: 71 }),
    }),
    content: contractString({ maxLength: 16000 }),
    offset: z.int().min(0).max(8388608),
    total: z.int().min(0).max(8388608),
    nextOffset: z.int().min(0).max(8388608).optional(),
});
