import { z } from "zod";
import { contractString } from "@bernouy/ulvia-sdk";
export const getProviderInstallationInputSchema = z.strictObject({
    installationId: contractString({ minLength: 1, maxLength: 96 }),
});

export const getProviderInstallationOutputSchema = z.strictObject({
    id: contractString({ maxLength: 96 }),
    providerId: contractString({ maxLength: 193 }),
    accountId: contractString({ maxLength: 160 }),
    endpoint: contractString({ format: "uri", maxLength: 2048 }),
    status: contractString({ enum: ["enabled", "disabled", "revoked"], maxLength: 8 }),
    manifestVersion: contractString({ maxLength: 64 }),
    revision: z.int().min(1).max(9007199254740991),
    contracts: z
        .array(
            z.strictObject({
                contractId: contractString({ maxLength: 193 }),
                version: contractString({ maxLength: 64 }),
                digest: contractString({ maxLength: 71 }),
                status: contractString({ enum: ["ready", "setup-required", "unavailable"], maxLength: 14 }),
            }),
        )
        .max(256)
        .readonly(),
    selections: z
        .array(
            z.strictObject({
                contractId: contractString({ maxLength: 193 }),
                version: contractString({ maxLength: 64 }),
                digest: contractString({ maxLength: 71 }),
                installationId: contractString({ maxLength: 96 }),
            }),
        )
        .max(256)
        .readonly(),
    observedAt: contractString({ format: "date-time", maxLength: 40 }).optional(),
});
