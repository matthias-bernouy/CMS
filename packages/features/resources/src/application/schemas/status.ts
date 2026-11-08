import { z } from "zod";
import { contractString } from "@bernouy/ulvia-sdk";
import { digestSchema, localeSchema, reviewJsonSchema } from "./common";
const count = z.int().min(0).max(2048);
export const operationStateSchema = z.strictObject({
    operationId: contractString({ maxLength: 64 }),
    operationStatus: contractString({ enum: ["none", "queued", "running", "succeeded", "failed"], maxLength: 9 }),
    errorMessage: contractString({ maxLength: 2048 }),
});
export const initializationStatusSchema = z.strictObject({
    status: contractString({ enum: ["pending", "running", "completed"], maxLength: 9 }),
    revision: z.int().min(0).max(Number.MAX_SAFE_INTEGER),
    choice: contractString({ enum: ["empty", "base"], maxLength: 5 }).nullable(),
    locale: localeSchema.nullable(),
    planDigest: digestSchema.nullable(),
    reviewJson: reviewJsonSchema.nullable(),
    counts: z.strictObject({ blocs: count, assets: count, texts: count, pages: count }),
    completed: z.strictObject({ blocs: count, assets: count, texts: count, pages: count }),
    redirectPath: contractString({ maxLength: 2048 }),
    ...operationStateSchema.shape,
});
export const initializationPlanSchema = z.strictObject({
    choice: contractString({ enum: ["empty", "base"], maxLength: 5 }),
    locale: localeSchema,
});
export const initializationReviewSchema = z.strictObject({ planDigest: digestSchema, reviewJson: reviewJsonSchema });
export const initializationApplySchema = z.strictObject({
    reviewJson: reviewJsonSchema,
    browserRiskAcknowledgement: digestSchema.nullable(),
});
