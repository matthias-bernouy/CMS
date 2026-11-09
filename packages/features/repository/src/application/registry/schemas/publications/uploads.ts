import { MAX_PUBLICATION_METADATA_BYTES } from "repository/repository/publication/protocol";
import { z } from "zod";
import { contractString, contractBinary } from "@bernouy/ulvia-sdk";
import { assetDownloadOutputSchema } from "repository/application/registry/schemas/downloads";
export const publicationAbortInputSchema = z.strictObject({
    namespace: contractString({ minLength: 1, maxLength: 96 }),
    uploadId: contractString({ minLength: 1, maxLength: 36, format: "uuid" }),
    namespaceRevision: z.int().min(1),
});

export const publicationAssetInputSchema = z.strictObject({
    namespace: contractString({ minLength: 1, maxLength: 96 }),
    uploadId: contractString({ minLength: 1, maxLength: 36, format: "uuid" }),
    assetId: contractString({ minLength: 1, maxLength: 512 }),
    bytes: assetDownloadOutputSchema,
    namespaceRevision: z.int().min(1),
    contentDigest: contractString({ minLength: 71, maxLength: 71 }),
});

export const publicationBeginInputSchema = z.strictObject({
    namespace: contractString({ minLength: 1, maxLength: 96 }),
    manifest: contractBinary({ maxBytes: MAX_PUBLICATION_METADATA_BYTES }),
    namespaceRevision: z.int().min(1),
});

export const publicationBeginOutputSchema = z
    .strictObject({
        uploadId: contractString({ minLength: 1, maxLength: 36, format: "uuid" }),
        expiresAt: contractString({ minLength: 1, maxLength: 64, format: "date-time" }),
        uploadedAssetIds: z
            .array(contractString({ minLength: 1, maxLength: 512 }))
            .max(1024)
            .readonly(),
    })
    .readonly();

export const publicationCommitOutputSchema = z
    .strictObject({
        kind: contractString({ minLength: 1, maxLength: 32, enum: ["collection", "contract", "provider-manifest"] }),
        added: z.boolean(),
        digest: contractString({ minLength: 1, maxLength: 71 }),
    })
    .readonly();
