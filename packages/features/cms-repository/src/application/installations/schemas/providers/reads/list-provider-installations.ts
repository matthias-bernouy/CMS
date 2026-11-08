import { z } from "zod";
import { contractString } from "@bernouy/ulvia-sdk";
export const listProviderInstallationsOutputSchema = z.strictObject({
    selectionRevision: z.int().min(0).max(9007199254740991),
    installations: z
        .array(
            z.strictObject({
                id: contractString({ maxLength: 96 }),
                providerId: contractString({ maxLength: 193 }),
                accountId: contractString({ maxLength: 160 }),
                endpoint: contractString({ format: "uri", maxLength: 2048 }),
                status: contractString({ enum: ["enabled", "disabled", "revoked"], maxLength: 8 }),
                manifestVersion: contractString({ maxLength: 64 }),
                revision: z.int().min(1).max(9007199254740991),
                selectionCount: z.int().min(0).max(256),
                observedAt: contractString({ format: "date-time", maxLength: 40 }).optional(),
            }),
        )
        .max(128)
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
    routes: z
        .array(
            z.strictObject({
                contractId: contractString({ maxLength: 193 }),
                options: z
                    .array(
                        z.strictObject({
                            providerId: contractString({ maxLength: 193 }),
                            accountId: contractString({ maxLength: 160 }),
                            status: contractString({
                                enum: ["ready", "setup-required", "unavailable"],
                                maxLength: 14,
                            }),
                            selection: z.strictObject({
                                contractId: contractString({ maxLength: 193 }),
                                version: contractString({ maxLength: 64 }),
                                digest: contractString({ maxLength: 71 }),
                                installationId: contractString({ maxLength: 96 }),
                            }),
                        }),
                    )
                    .max(128)
                    .readonly(),
                selectedInstallationId: contractString({ maxLength: 96 }).optional(),
                selectedDigest: contractString({ maxLength: 71 }).optional(),
            }),
        )
        .max(256)
        .readonly(),
});
