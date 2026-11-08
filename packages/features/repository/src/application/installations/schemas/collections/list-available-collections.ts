import { z } from "zod";
import { contractString } from "@bernouy/ulvia-sdk";
export const listAvailableCollectionsInputSchema = z.strictObject({
    channel: contractString({ enum: ["stable", "beta", "all"], maxLength: 6 }).optional(),
});

export const listAvailableCollectionsOutputSchema = z.strictObject({
    revision: z.int().min(0).max(9007199254740991),
    repositories: z
        .array(contractString({ maxLength: 96 }))
        .max(32)
        .readonly(),
    releases: z
        .array(
            z.strictObject({
                repositoryId: contractString({ maxLength: 96 }),
                publisherId: contractString({ maxLength: 96 }),
                collectionId: contractString({ maxLength: 193 }),
                version: contractString({ maxLength: 64 }),
                digest: contractString({ maxLength: 71 }),
                name: contractString({ maxLength: 128 }),
                description: contractString({ maxLength: 4096 }),
                blocCount: z.int().min(0).max(1024),
                hasTheme: z.boolean(),
                browserRisk: contractString({ maxLength: 6, enum: ["none", "review", "high"] }),
                browserRiskDigest: contractString({ maxLength: 71 }),
                javaScriptBlocCount: z.int().min(0).max(1024),
                javaScriptBlocs: z
                    .array(contractString({ maxLength: 96 }))
                    .max(1024)
                    .readonly(),
                frameBlocCount: z.int().min(0).max(1024),
                frameBlocs: z
                    .array(
                        z.strictObject({
                            id: contractString({ maxLength: 96 }),
                            origins: z
                                .array(contractString({ maxLength: 2048 }))
                                .max(32)
                                .readonly(),
                            sandbox: z
                                .array(contractString({ maxLength: 17 }))
                                .max(6)
                                .readonly(),
                        }),
                    )
                    .max(1024)
                    .readonly(),
                externalFrameOrigins: z
                    .array(contractString({ maxLength: 2048 }))
                    .max(32)
                    .readonly(),
                scriptsWithSameOrigin: z.boolean(),
                action: contractString({ maxLength: 7, enum: ["install", "upgrade", "current", "older"] }),
                channel: contractString({ enum: ["stable", "beta"], maxLength: 6 }),
            }),
        )
        .max(1024)
        .readonly(),
    installed: z
        .array(
            z.strictObject({
                publisherId: contractString({ maxLength: 96 }),
                collectionId: contractString({ maxLength: 193 }),
                version: contractString({ maxLength: 64 }),
                digest: contractString({ maxLength: 71 }),
                configurable: z.boolean(),
                repositoryId: contractString({ maxLength: 96 }).optional(),
            }),
        )
        .max(256)
        .readonly(),
});
