import { z } from "zod";
import { contractString } from "@bernouy/ulvia-sdk";
export const repositorySearchInputSchema = z.strictObject({
    query: contractString({ minLength: 1, maxLength: 2048 }),
    kinds: z
        .array(
            contractString({
                minLength: 1,
                maxLength: 32,
                enum: ["collection", "bloc", "contract", "provider-manifest"],
            }),
        )
        .max(4)
        .readonly()
        .optional(),
    publisherId: contractString({ minLength: 1, maxLength: 96 }).optional(),
    contractId: contractString({ minLength: 1, maxLength: 193 }).optional(),
    limit: z.int().min(1).max(50).optional(),
    cursor: contractString({ minLength: 1, maxLength: 8192 }).optional(),
    repositoryIds: z
        .array(contractString({ minLength: 1, maxLength: 96 }))
        .max(8)
        .readonly()
        .optional(),
    channel: contractString({ enum: ["stable", "beta", "all"], maxLength: 6 }).optional(),
});

export const repositorySearchOutputSchema = z.strictObject({
    mode: contractString({ minLength: 1, maxLength: 7, enum: ["hybrid", "lexical"] }),
    degraded: z.boolean(),
    partial: z.boolean(),
    unavailableRepositories: z
        .array(contractString({ minLength: 1, maxLength: 96 }))
        .max(8)
        .readonly(),
    results: z
        .array(
            z.strictObject({
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
                name: contractString({ maxLength: 512 }),
                description: contractString({ maxLength: 1600 }),
                categories: z
                    .array(contractString({ minLength: 1, maxLength: 200 }))
                    .max(32)
                    .readonly(),
                contractIds: z
                    .array(contractString({ minLength: 1, maxLength: 193 }))
                    .max(128)
                    .readonly(),
                repositoryId: contractString({ minLength: 1, maxLength: 96 }),
                blocId: contractString({ minLength: 1, maxLength: 512 }).optional(),
            }),
        )
        .max(50)
        .readonly(),
    nextCursor: contractString({ minLength: 1, maxLength: 8192 }).optional(),
});
