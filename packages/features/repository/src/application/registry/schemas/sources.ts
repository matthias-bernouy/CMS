import { AUTHORING_SOURCE_LIMITS } from "repository/repository/authoring/preparations/source/limits";
import { z } from "zod";
import { contractString } from "@bernouy/ulvia-sdk";
export const artifactSourcePutInputSchema = z.strictObject({
    namespace: contractString({ maxLength: 96 }),
    id: contractString({ maxLength: 193 }),
    version: contractString({ maxLength: 64 }),
    sourceJson: contractString({ maxLength: AUTHORING_SOURCE_LIMITS.snapshotBytes, sensitive: true }),
    releaseDigest: contractString({ maxLength: 71 }),
    namespaceRevision: z.int().min(1),
    kind: contractString({ enum: ["contract", "provider-manifest"], maxLength: 17 }),
});

export const sourcePutInputSchema = z.strictObject({
    namespace: contractString({ maxLength: 96 }),
    collectionId: contractString({ maxLength: 193 }),
    version: contractString({ maxLength: 64 }),
    sourceJson: contractString({ maxLength: AUTHORING_SOURCE_LIMITS.snapshotBytes, sensitive: true }),
    releaseDigest: contractString({ maxLength: 71 }),
    namespaceRevision: z.int().min(1),
});

export const artifactSourceGetInputSchema = z.strictObject({
    namespace: contractString({ maxLength: 96 }),
    id: contractString({ maxLength: 193 }),
    version: contractString({ maxLength: 64 }),
    namespaceRevision: z.int().min(1),
    kind: contractString({ enum: ["contract", "provider-manifest"], maxLength: 17 }),
});

export const artifactSourceGetOutputSchema = z
    .strictObject({
        sourceJson: contractString({ maxLength: 1048576, sensitive: true }),
        releaseDigest: contractString({ maxLength: 71 }),
    })
    .readonly()
    .nullable();

export const sourceGetInputSchema = z.strictObject({
    namespace: contractString({ maxLength: 96 }),
    collectionId: contractString({ maxLength: 193 }),
    version: contractString({ maxLength: 64 }),
    namespaceRevision: z.int().min(1),
});

export const sourceReadInputSchema = z.strictObject({
    namespace: contractString({ maxLength: 96 }),
    id: contractString({ maxLength: 193 }),
    version: contractString({ maxLength: 64 }),
    namespaceRevision: z.int().min(1),
    kind: contractString({ enum: ["collection", "contract", "provider-manifest"], maxLength: 17 }),
});
export const sourceReadOutputSchema = z
    .strictObject({
        sourceJson: contractString({ maxLength: AUTHORING_SOURCE_LIMITS.snapshotBytes, sensitive: true }),
        releaseDigest: contractString({ maxLength: 71 }),
    })
    .readonly()
    .nullable();
