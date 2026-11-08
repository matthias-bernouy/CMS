import { z } from "zod";
import { contractString } from "@bernouy/ulvia-sdk";
import { namespaceCredentialsSchema, namespacePermissionSchema, secretDateSchema } from "secrets/schemas/fields";

export const createNamespaceKeyInputSchema = namespaceCredentialsSchema.extend({
    permissions: z.array(namespacePermissionSchema).min(1).max(5),
    expiresAt: secretDateSchema.nullable().optional(),
});
export const namespaceKeyInputSchema = namespaceCredentialsSchema.extend({
    keyId: contractString({ minLength: 1, maxLength: 128 }),
});

// This state-dependent check is internal; public v1 accepts nullable timestamps and rejects null at execution.
export const futureNamespaceExpirationSchema = createNamespaceKeyInputSchema.shape.expiresAt
    .unwrap()
    .pipe(z.string())
    .transform((value) => new Date(value))
    .refine(
        (date) => Number.isFinite(date.getTime()) && date > new Date(),
        "Namespace key expiration must be in the future",
    );
