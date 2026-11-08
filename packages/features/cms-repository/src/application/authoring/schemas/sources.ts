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
