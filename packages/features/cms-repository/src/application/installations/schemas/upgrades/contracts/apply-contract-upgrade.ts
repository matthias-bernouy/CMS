import { z } from "zod";
import { contractString } from "@bernouy/ulvia-sdk";
export const applyContractUpgradeInputSchema = z.strictObject({
    selections: z
        .array(
            z.strictObject({
                contractId: contractString({ minLength: 1, maxLength: 193 }),
                version: contractString({ minLength: 1, maxLength: 64 }),
                digest: contractString({ minLength: 71, maxLength: 71 }),
                installationId: contractString({ minLength: 1, maxLength: 96 }),
            }),
        )
        .max(256)
        .readonly(),
    planDigest: contractString({ minLength: 71, maxLength: 71 }),
    grants: z
        .strictObject({
            default: contractString({ enum: ["allow-selected"], maxLength: 16 }),
            denied: z
                .array(
                    z.strictObject({
                        contractId: contractString({ minLength: 1, maxLength: 193 }),
                        capabilityId: contractString({ minLength: 1, maxLength: 96 }),
                    }),
                )
                .max(4096)
                .readonly(),
        })
        .optional(),
});

export const applyContractUpgradeOutputSchema = z.strictObject({
    upgradeId: contractString({ maxLength: 71 }),
    status: contractString({ maxLength: 16, enum: ["prepared", "applying", "completed", "cancelled"] }),
    selectionRevision: z.int().min(0).max(9007199254740991),
});
