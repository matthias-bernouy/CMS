import { z } from "zod";
import { contractString } from "@bernouy/ulvia-sdk";
export const planContractUpgradeInputSchema = z.strictObject({
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
        .readonly()
        .optional(),
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
    selection: z
        .strictObject({
            contractId: contractString({ minLength: 1, maxLength: 193 }),
            version: contractString({ minLength: 1, maxLength: 64 }),
            digest: contractString({ minLength: 71, maxLength: 71 }),
            installationId: contractString({ minLength: 1, maxLength: 96 }),
        })
        .optional(),
});

export const planContractUpgradeOutputSchema = z.strictObject({
    expectedRevision: z.int().min(0).max(9007199254740991),
    planDigest: contractString({ maxLength: 71 }),
    status: contractString({ maxLength: 16, enum: ["applicable", "blocked", "incomplete"] }),
    issueCount: z.int().min(0).max(9007199254740991),
    issues: z
        .array(
            z.strictObject({
                code: contractString({ maxLength: 48 }),
                location: contractString({ maxLength: 4096 }),
                message: contractString({ maxLength: 4096 }),
                replacement: contractString({ maxLength: 512 }).optional(),
            }),
        )
        .max(1024)
        .readonly(),
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
    grants: z.strictObject({
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
    }),
    source: z
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
    usageDigest: contractString({ maxLength: 71 }),
    authority: z.strictObject({
        providers: z
            .array(
                z.strictObject({
                    installationId: contractString({ minLength: 1, maxLength: 128 }),
                    manifestDigest: contractString({ minLength: 1, maxLength: 128 }),
                }),
            )
            .max(256)
            .readonly(),
        capabilities: z
            .array(
                z.strictObject({
                    selection: z.strictObject({
                        siteId: contractString({ minLength: 1, maxLength: 128 }),
                        contractId: contractString({ minLength: 1, maxLength: 193 }),
                        version: contractString({ minLength: 1, maxLength: 128 }),
                        digest: contractString({ minLength: 1, maxLength: 128 }),
                        installationId: contractString({ minLength: 1, maxLength: 128 }),
                    }),
                    contractId: contractString({ minLength: 1, maxLength: 193 }),
                    version: contractString({ minLength: 1, maxLength: 128 }),
                    digest: contractString({ minLength: 1, maxLength: 128 }),
                    capabilityId: contractString({ minLength: 1, maxLength: 128 }),
                    effect: contractString({ enum: ["query", "command"], maxLength: 7 }),
                    sensitive: z.boolean(),
                    access: contractString({ enum: ["public", "authenticated", "admin"], maxLength: 13 }),
                }),
            )
            .max(3072)
            .readonly(),
        machine: z
            .array(
                z.strictObject({
                    installationId: contractString({ minLength: 1, maxLength: 128 }),
                    target: z.int().min(0).max(3071),
                    targetLabel: contractString({ maxLength: 512 }),
                    fromContractId: contractString({ minLength: 1, maxLength: 128 }).optional(),
                }),
            )
            .max(1024)
            .readonly(),
        delegated: z
            .array(
                z.strictObject({
                    source: z.int().min(0).max(3071),
                    target: z.int().min(0).max(3071),
                    sourceLabel: contractString({ maxLength: 512 }),
                    targetLabel: contractString({ maxLength: 512 }),
                }),
            )
            .max(1024)
            .readonly(),
    }),
    authorityAdded: z
        .array(
            z.strictObject({
                source: z.int().min(0).max(3071),
                target: z.int().min(0).max(3071),
                sourceLabel: contractString({ maxLength: 512 }),
                targetLabel: contractString({ maxLength: 512 }),
            }),
        )
        .max(1024)
        .readonly(),
});
