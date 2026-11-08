import { z } from "zod";
import { contractString } from "@bernouy/ulvia-sdk";
export const catalogueMetadataSchema = z
    .strictObject({
        name: contractString({ maxLength: 128, minLength: 1 }),
        description: contractString({ maxLength: 4096 }).optional(),
        icon: contractString({ maxLength: 32, minLength: 1 }).optional(),
        categories: z
            .array(contractString({ maxLength: 32, minLength: 1 }))
            .max(6)
            .readonly()
            .optional(),
        publishedAt: contractString({ maxLength: 64, minLength: 1, format: "date-time" }).optional(),
        links: z
            .strictObject({
                website: contractString({ maxLength: 2048, minLength: 1 }).optional(),
                setup: contractString({ maxLength: 2048, minLength: 1 }).optional(),
                documentation: contractString({ maxLength: 2048, minLength: 1 }).optional(),
                support: contractString({ maxLength: 2048, minLength: 1 }).optional(),
            })
            .readonly()
            .optional(),
        blocCount: z.int().min(0).optional(),
        hasTheme: z.boolean().optional(),
        browserRisk: contractString({ maxLength: 6, minLength: 1, enum: ["none", "review", "high"] }).optional(),
        browserRiskDigest: contractString({ maxLength: 71, minLength: 1 }).optional(),
        javaScriptBlocCount: z.int().min(0).optional(),
        frameBlocCount: z.int().min(0).optional(),
        externalFrameOrigins: z
            .array(contractString({ maxLength: 2048, minLength: 1 }))
            .max(32)
            .readonly()
            .optional(),
        scriptsWithSameOrigin: z.boolean().optional(),
    })
    .readonly();
