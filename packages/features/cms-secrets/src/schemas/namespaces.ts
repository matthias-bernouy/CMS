import { z } from "zod";
import { contractString } from "@bernouy/ulvia-sdk";
import { namespaceCredentialsSchema, secretDateSchema } from "cms-secrets/schemas/fields";

export const createNamespaceInputSchema = z.strictObject({ name: contractString({ minLength: 1, maxLength: 160 }) });
export const namespaceCredentialSchema = z.strictObject({
    keyId: contractString({ maxLength: 128 }),
    namespaceKey: namespaceCredentialsSchema.shape.namespaceKey,
});
export const createNamespaceOutputSchema = z.strictObject({
    namespaceId: contractString({ maxLength: 128 }),
    ...namespaceCredentialSchema.shape,
});
export const namespaceMetadataSchema = z.strictObject({
    id: contractString({ maxLength: 128 }),
    name: contractString({ maxLength: 160 }),
    createdAt: secretDateSchema,
    createdBy: z.strictObject({
        kind: contractString({ enum: ["administrator", "provider", "system"], maxLength: 13 }),
        id: contractString({ maxLength: 256 }),
    }),
});
