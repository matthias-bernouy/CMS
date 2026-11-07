import { z } from "zod";
import { contractString } from "@bernouy/ulvia-sdk";
import {
    namespaceCredentialsSchema,
    secretDateSchema,
    secretIdSchema,
    secretNameSchema,
    secretValueSchema,
    secretVersionSchema,
} from "cms-secrets/schemas/fields";

export const secretMetadataSchema = z.strictObject({
    namespaceId: contractString({ maxLength: 128 }),
    secretId: contractString({ maxLength: 160 }),
    name: contractString({ maxLength: 96 }),
    version: secretVersionSchema,
    createdAt: secretDateSchema,
    rotatedAt: secretDateSchema.nullable(),
});
export const rotatedSecretMetadataSchema = secretMetadataSchema.extend({
    version: z.int().min(2).max(Number.MAX_SAFE_INTEGER),
    rotatedAt: secretDateSchema,
});
export const secretReferenceSchema = namespaceCredentialsSchema.extend({ secretId: secretIdSchema });
export const secretNameInputSchema = namespaceCredentialsSchema.extend({ name: secretNameSchema });
export const createSecretInputSchema = secretNameInputSchema.extend({ value: secretValueSchema });
export const secretMutationInputSchema = secretReferenceSchema.extend({ expectedVersion: secretVersionSchema });
export const rotateSecretInputSchema = secretReferenceSchema.extend({
    value: secretValueSchema,
    expectedVersion: secretVersionSchema,
});
export const listSecretsInputSchema = namespaceCredentialsSchema.extend({ limit: z.int().min(1).max(100).optional() });
export const listSecretsOutputSchema = z.strictObject({ items: z.array(secretMetadataSchema).max(100).readonly() });
export const deleteSecretOutputSchema = z.strictObject({ deleted: z.boolean() });
export const resolvedSecretSchema = secretMetadataSchema
    .pick({ namespaceId: true, secretId: true, version: true })
    .extend({ value: secretValueSchema });
