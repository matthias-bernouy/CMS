import { z } from "zod";
import { contractString } from "@bernouy/ulvia-sdk";
export const documentationSearchInputSchema = z.strictObject({
    query: contractString({ minLength: 1, maxLength: 2048 }),
    contractId: contractString({ maxLength: 193 }).optional(),
    capabilityId: contractString({ maxLength: 128 }).optional(),
    limit: z.int().min(1).max(10).optional(),
});

export const documentationSearchOutputSchema = z.strictObject({
    mode: contractString({ enum: ["hybrid", "lexical"], maxLength: 7 }),
    degraded: z.boolean(),
    results: z
        .array(
            z.strictObject({
                reference: z.strictObject({
                    contractId: contractString({ maxLength: 193 }),
                    releaseDigest: contractString({ maxLength: 71 }),
                    path: contractString({ maxLength: 256 }),
                }),
                version: contractString({ maxLength: 64 }),
                title: contractString({ maxLength: 200 }),
                heading: contractString({ maxLength: 200 }),
                excerpt: contractString({ maxLength: 1600 }),
                capabilities: z
                    .array(contractString({ maxLength: 128 }))
                    .max(512)
                    .readonly(),
            }),
        )
        .max(10)
        .readonly(),
});
