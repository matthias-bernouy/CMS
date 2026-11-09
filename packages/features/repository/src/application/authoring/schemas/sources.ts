import { AUTHORING_SOURCE_LIMITS } from "repository/repository/authoring/preparations/source/limits";
import { z } from "zod";
import { contractString } from "@bernouy/ulvia-sdk";
export const sourceSnapshotSchema = z
    .strictObject({
        sourceJson: contractString({ maxLength: 1048576, sensitive: true }),
        releaseDigest: contractString({ maxLength: 71 }),
    })
    .readonly()
    .nullable();

export const getContractSourcesInputSchema = z.strictObject({
    namespace: contractString({ maxLength: 96 }),
    contractId: contractString({ maxLength: 193 }),
    version: contractString({ maxLength: 64 }),
});

export const getProviderManifestSourcesInputSchema = z.strictObject({
    namespace: contractString({ maxLength: 96 }),
    providerId: contractString({ maxLength: 193 }),
    version: contractString({ maxLength: 64 }),
});

export const getCollectionSourcesInputSchema = z.strictObject({
    namespace: contractString({ maxLength: 96 }),
    collectionId: contractString({ maxLength: 193 }),
    version: contractString({ maxLength: 64 }),
});

export const getSourceSnapshotInputSchema = z.strictObject({
    namespace: contractString({ maxLength: 96 }),
    id: contractString({ maxLength: 193 }),
    version: contractString({ maxLength: 64 }),
    kind: contractString({ enum: ["collection", "contract", "provider-manifest"], maxLength: 17 }),
});
export const expandedSourceSnapshotSchema = z
    .strictObject({
        sourceJson: contractString({ maxLength: AUTHORING_SOURCE_LIMITS.snapshotBytes, sensitive: true }),
        releaseDigest: contractString({ maxLength: 71 }),
    })
    .readonly()
    .nullable();
