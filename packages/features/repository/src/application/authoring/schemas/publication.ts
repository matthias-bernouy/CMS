import { z } from "zod";
import { contractString } from "@bernouy/ulvia-sdk";
export const publishInputSchema = z.strictObject({
    preparationId: contractString({ maxLength: 36 }),
    expectedDigest: contractString({ maxLength: 71 }),
});

export const publishContractOutputSchema = z
    .strictObject({
        repositoryId: contractString({ maxLength: 96 }),
        publisherId: contractString({ maxLength: 96 }),
        contractId: contractString({ maxLength: 193 }),
        version: contractString({ maxLength: 64 }),
        digest: contractString({ maxLength: 71 }),
        kind: contractString({ maxLength: 8, enum: ["contract"] }),
        added: z.boolean(),
    })
    .readonly();

export const publishProviderManifestOutputSchema = z
    .strictObject({
        repositoryId: contractString({ maxLength: 96 }),
        publisherId: contractString({ maxLength: 96 }),
        providerId: contractString({ maxLength: 193 }),
        version: contractString({ maxLength: 64 }),
        digest: contractString({ maxLength: 71 }),
        kind: contractString({ maxLength: 17, enum: ["provider-manifest"] }),
        added: z.boolean(),
    })
    .readonly();

export const publishCollectionOutputSchema = z
    .strictObject({
        repositoryId: contractString({ maxLength: 96 }),
        publisherId: contractString({ maxLength: 96 }),
        collectionId: contractString({ maxLength: 193 }),
        version: contractString({ maxLength: 64 }),
        digest: contractString({ maxLength: 71 }),
        kind: contractString({ maxLength: 16 }),
        added: z.boolean(),
    })
    .readonly();
