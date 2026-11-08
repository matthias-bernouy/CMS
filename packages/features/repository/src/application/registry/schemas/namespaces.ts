import { z } from "zod";
import { contractString } from "@bernouy/ulvia-sdk";
export const namespaceClaimInputSchema = z.strictObject({
    namespace: contractString({ minLength: 1, maxLength: 96 }),
});

export const namespaceClaimOutputSchema = z
    .strictObject({
        namespace: contractString({ minLength: 1, maxLength: 96 }),
        revision: z.int().min(1),
        state: contractString({ enum: ["active", "suspended"], maxLength: 9 }),
        updatedAt: contractString({ format: "date-time", maxLength: 40 }),
    })
    .readonly();

export const namespaceSuspendInputSchema = z.strictObject({
    namespace: contractString({ minLength: 1, maxLength: 96 }),
    namespaceRevision: z.int().min(1),
});

export const namespaceTransferInputSchema = z.strictObject({
    namespace: contractString({ minLength: 1, maxLength: 96 }),
    namespaceRevision: z.int().min(1),
    targetAccountId: contractString({ minLength: 1, maxLength: 256, sensitive: true }),
});

export const namespaceGetOutputSchema = z
    .strictObject({
        namespace: contractString({ minLength: 1, maxLength: 96 }),
        revision: z.int().min(1),
        state: contractString({ enum: ["active", "suspended"], maxLength: 9 }),
        updatedAt: contractString({ format: "date-time", maxLength: 40 }),
    })
    .readonly()
    .nullable();

export const namespaceListOutputSchema = z
    .strictObject({
        namespaces: z.array(namespaceClaimOutputSchema).max(32).readonly(),
    })
    .readonly();
