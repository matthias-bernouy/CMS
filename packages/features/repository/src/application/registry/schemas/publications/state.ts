import { DEFAULT_COLLECTION_LIMITS } from "repository/collections/core/limits";
import { z } from "zod";
import { contractString } from "@bernouy/ulvia-sdk";
export const publicationYankInputSchema = z.strictObject({
    kind: contractString({ minLength: 1, maxLength: 32, enum: ["collection", "contract", "provider-manifest"] }),
    publisherId: contractString({ minLength: 1, maxLength: 96 }),
    id: contractString({ minLength: 1, maxLength: 193 }),
    version: contractString({ minLength: 1, maxLength: 128 }),
    expectedRevision: z.int().min(0),
    reason: contractString({ maxLength: 1024, minLength: 1 }).nullable(),
    namespaceRevision: z.int().min(1),
});

export const publicationYankOutputSchema = z
    .strictObject({
        revision: z.int().min(0),
        yank: z
            .strictObject({
                reason: contractString({ maxLength: 1024, minLength: 1 }),
                yankedAt: contractString({ maxLength: 64, minLength: 1 }),
            })
            .readonly()
            .nullable(),
    })
    .readonly();

export const publicationCheckCollectionInputSchema = z.strictObject({
    namespace: contractString({ minLength: 1, maxLength: 96 }),
    namespaceRevision: z.int().min(1),
    canonicalJson: contractString({ maxLength: DEFAULT_COLLECTION_LIMITS.maxDocumentBytes, sensitive: true }),
});

export const publicationCheckCollectionOutputSchema = z
    .strictObject({
        complete: z.boolean(),
        digest: contractString({ maxLength: 71 }),
    })
    .readonly();

export const publicationStateInputSchema = z.strictObject({
    kind: contractString({ minLength: 1, maxLength: 32, enum: ["collection", "contract", "provider-manifest"] }),
    publisherId: contractString({ minLength: 1, maxLength: 96 }),
    id: contractString({ minLength: 1, maxLength: 193 }),
    version: contractString({ minLength: 1, maxLength: 128 }),
});
