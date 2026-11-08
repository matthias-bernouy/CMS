import { z } from "zod";
import { contractString } from "@bernouy/ulvia-sdk";

const identifier = contractString({ minLength: 1, maxLength: 256 });
const digest = contractString({ minLength: 71, maxLength: 71 }).refine((value) => /^sha256:[0-9a-f]{64}$/u.test(value));
const count = z.int().min(0).max(2048);
const previewPageSchema = z.strictObject({
    path: contractString({ minLength: 1, maxLength: 2048 }),
    contentDigest: digest,
    visible: z.boolean(),
});
const browserRiskSchema = z.strictObject({
    level: z.enum(["none", "review", "high"]),
    javaScriptBlocs: z.array(contractString({ maxLength: 128 })).max(512),
    frames: z
        .array(
            z.strictObject({
                id: contractString({ maxLength: 128 }),
                origins: z.array(contractString({ maxLength: 2048 })).max(32),
                sandbox: z.array(contractString({ maxLength: 64 })).max(16),
            }),
        )
        .max(512),
});
export const initializationReviewSchema = z.strictObject({
    protocol: z.literal("ulvia-resource-review/v1"),
    instanceId: identifier,
    siteId: identifier,
    actorId: identifier,
    choice: z.enum(["empty", "base"]),
    locale: contractString({ minLength: 2, maxLength: 64 }),
    stateRevision: z.int().min(0).max(Number.MAX_SAFE_INTEGER),
    systemRevision: z.int().min(0).max(Number.MAX_SAFE_INTEGER),
    executionFingerprint: digest,
    archiveDigest: digest.nullable(),
    counts: z.strictObject({ blocs: count, assets: count, texts: count, pages: count }),
    keys: z.strictObject({
        assets: z.array(contractString({ maxLength: 768 })).max(512),
        texts: z.array(contractString({ maxLength: 193 })).max(32),
        blocs: z.array(contractString({ maxLength: 128 })).max(512),
    }),
    browserRisk: browserRiskSchema,
    browserRiskDigest: digest,
    requirements: z
        .array(
            z.strictObject({
                contractId: contractString({ maxLength: 193 }),
                capabilityId: contractString({ maxLength: 128 }),
                versionRange: contractString({ maxLength: 256 }),
            }),
        )
        .max(512),
    pages: z.array(previewPageSchema).max(256),
    themeDigest: digest,
    digest,
});
const initializationProgressSchema = z.strictObject({
    assets: z.array(contractString({ minLength: 1, maxLength: 768 })).max(512),
    texts: z.array(contractString({ minLength: 1, maxLength: 193 })).max(32),
    blocs: z.array(contractString({ minLength: 1, maxLength: 128 })).max(512),
    theme: z.boolean(),
    pages: z.array(contractString({ minLength: 1, maxLength: 2048 })).max(256),
    pageIds: z
        .record(contractString({ minLength: 1, maxLength: 2048 }), identifier)
        .refine((value) => Object.keys(value).length <= 256),
});
export const initializationStateSchema = z.strictObject({
    protocol: z.literal("ulvia-resource-initialization/v1"),
    instanceId: identifier,
    siteId: identifier,
    revision: z.int().min(0).max(Number.MAX_SAFE_INTEGER),
    status: z.enum(["pending", "running", "completed"]),
    review: initializationReviewSchema.nullable(),
    progress: initializationProgressSchema,
});
export type ResourceInitializationReview = z.output<typeof initializationReviewSchema>;
export type ResourceInitializationProgress = z.output<typeof initializationProgressSchema>;
export type ResourceInitializationState = z.output<typeof initializationStateSchema>;
export type ResourceBrowserRisk = z.output<typeof browserRiskSchema>;
export type ResourcePreviewPage = z.output<typeof previewPageSchema>;
