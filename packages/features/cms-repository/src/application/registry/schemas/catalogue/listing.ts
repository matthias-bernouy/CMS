import { z } from "zod";
import { contractString } from "@bernouy/ulvia-sdk";
import { catalogueMetadataSchema } from "cms-repository/application/registry/schemas/catalogue/metadata";
export const catalogueListInputSchema = z.strictObject({
    kind: contractString({ minLength: 1, maxLength: 32, enum: ["collection", "contract", "provider-manifest"] }),
    limit: z.int().min(1).max(256),
    cursor: contractString({ minLength: 1, maxLength: 1024 }).optional(),
    publisherId: contractString({ minLength: 1, maxLength: 96 }).optional(),
    id: contractString({ minLength: 1, maxLength: 193 }).optional(),
    version: contractString({ minLength: 1, maxLength: 128 }).optional(),
    channel: contractString({ enum: ["stable", "beta", "all"], maxLength: 6 }).optional(),
});

export const catalogueListOutputSchema = z
    .strictObject({
        releases: z
            .array(
                z
                    .strictObject({
                        kind: contractString({
                            minLength: 1,
                            maxLength: 32,
                            enum: ["collection", "contract", "provider-manifest"],
                        }),
                        publisherId: contractString({ minLength: 1, maxLength: 96 }),
                        id: contractString({ minLength: 1, maxLength: 193 }),
                        version: contractString({ minLength: 1, maxLength: 128 }),
                        digest: contractString({ minLength: 1, maxLength: 71 }),
                        metadata: catalogueMetadataSchema,
                    })
                    .readonly(),
            )
            .max(256)
            .readonly(),
        nextCursor: contractString({ minLength: 1, maxLength: 1024 }).optional(),
    })
    .readonly();

export const repositoryInfoOutputSchema = z
    .strictObject({
        protocol: contractString({ minLength: 1, maxLength: 64 }),
        repositoryId: contractString({ minLength: 1, maxLength: 128 }),
    })
    .readonly();
