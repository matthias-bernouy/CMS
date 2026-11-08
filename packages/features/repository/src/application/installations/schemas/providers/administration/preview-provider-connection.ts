import { z } from "zod";
import { contractString } from "@bernouy/ulvia-sdk";
export const previewProviderConnectionInputSchema = z.strictObject({
    providerId: contractString({ maxLength: 193 }),
    version: contractString({ maxLength: 128 }),
    endpoint: contractString({ maxLength: 2048 }),
    token: contractString({ maxLength: 4096, sensitive: true }),
    installationId: contractString({ maxLength: 128 }).optional(),
    revision: z.int().min(0).max(9007199254740991).optional(),
});

export const previewProviderConnectionOutputSchema = z.strictObject({
    ticket: contractString({ maxLength: 128 }),
    operation: contractString({ maxLength: 128 }),
    providerId: contractString({ maxLength: 193 }),
    providerName: contractString({ maxLength: 128 }),
    accountId: contractString({ maxLength: 128 }),
    accountLabel: contractString({ maxLength: 128 }),
    endpoint: contractString({ maxLength: 2048 }),
    manifestVersion: contractString({ maxLength: 128 }),
    manifestDigest: contractString({ maxLength: 128 }),
    check: contractString({ maxLength: 128 }),
    contracts: z
        .array(
            z.strictObject({
                contractId: contractString({ maxLength: 193 }),
                version: contractString({ maxLength: 128 }),
                status: contractString({ maxLength: 128 }),
            }),
        )
        .max(256)
        .readonly(),
    requests: z
        .array(
            z.strictObject({
                contractId: contractString({ maxLength: 193 }),
                capabilityId: contractString({ maxLength: 128 }),
                versionRange: contractString({ maxLength: 512 }),
                optional: z.boolean(),
            }),
        )
        .max(10000)
        .readonly(),
    authorityDigest: contractString({ minLength: 1, maxLength: 128 }),
    delegation: z.strictObject({
        policies: z
            .array(
                z.strictObject({
                    implementationContractId: contractString({ minLength: 1, maxLength: 128 }),
                    sources: z
                        .array(contractString({ minLength: 1, maxLength: 128 }))
                        .max(1024)
                        .readonly(),
                    allow: z
                        .array(
                            z.strictObject({
                                contractId: contractString({ minLength: 1, maxLength: 193 }),
                                capabilityId: contractString({ minLength: 1, maxLength: 128 }),
                                effect: contractString({ enum: ["query", "command", "*"], maxLength: 7 }),
                                sensitive: z.boolean().optional(),
                            }),
                        )
                        .max(1024)
                        .readonly(),
                }),
            )
            .max(1024)
            .readonly(),
        matches: z
            .array(
                z.strictObject({
                    sourceContractId: contractString({ minLength: 1, maxLength: 193 }),
                    sourceVersion: contractString({ minLength: 1, maxLength: 128 }),
                    sourceDigest: contractString({ minLength: 1, maxLength: 128 }),
                    sourceCapabilityId: contractString({ minLength: 1, maxLength: 128 }),
                    targetContractId: contractString({ minLength: 1, maxLength: 193 }),
                    targetVersion: contractString({ minLength: 1, maxLength: 128 }),
                    targetDigest: contractString({ minLength: 1, maxLength: 128 }),
                    targetCapabilityId: contractString({ minLength: 1, maxLength: 128 }),
                    effect: contractString({ enum: ["query", "command"], maxLength: 7 }),
                    sensitive: z.boolean(),
                    access: contractString({ enum: ["public", "authenticated", "admin"], maxLength: 13 }),
                }),
            )
            .max(1024)
            .readonly(),
    }),
});
