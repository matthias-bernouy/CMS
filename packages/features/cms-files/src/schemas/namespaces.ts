import { z } from "zod";
import { contractString } from "@bernouy/ulvia-sdk";
import { namespacePermissionSchema } from "./values";

export const createNamespaceKeyInputSchema = z.strictObject({
    namespaceId: contractString({ maxLength: 128 }),
    namespaceKey: contractString({ maxLength: 512, minLength: 20, sensitive: true }),
    permissions: z.array(namespacePermissionSchema).min(1).max(6).readonly(),
    expiresAt: contractString({ maxLength: 64 }).nullable().optional(),
});

export const createNamespaceKeyOutputSchema = z
    .strictObject({
        keyId: contractString({ maxLength: 128 }),
        namespaceKey: contractString({ maxLength: 512, minLength: 20, sensitive: true }),
    })
    .readonly();

export const createNamespaceInputSchema = z.strictObject({
    name: contractString({ maxLength: 160, minLength: 1 }),
    defaultVisibility: contractString({ maxLength: 7, enum: ["private", "public"] }),
});

export const createNamespaceOutputSchema = z
    .strictObject({
        namespaceId: contractString({ maxLength: 128 }),
        keyId: contractString({ maxLength: 128 }),
        namespaceKey: contractString({ maxLength: 512, minLength: 20, sensitive: true }),
    })
    .readonly();

export const namespaceCredentialsSchema = z.strictObject({
    namespaceId: contractString({ maxLength: 128 }),
    namespaceKey: contractString({ maxLength: 512, minLength: 20, sensitive: true }),
});

export const namespaceKeyTargetSchema = createNamespaceOutputSchema.unwrap();
