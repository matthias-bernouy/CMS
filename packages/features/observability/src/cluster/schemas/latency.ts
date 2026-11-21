import { z } from "zod";
import { contractString } from "@bernouy/ulvia-sdk";
import { clusterFiltersSchema, windowSchema } from "./logs";

export const latencyInputSchema = clusterFiltersSchema.omit({ eventPrefix: true }).extend({
    event: contractString({ minLength: 1, maxLength: 128 }),
    service: contractString({ minLength: 1, maxLength: 128 }),
    groupBy: contractString({ maxLength: 16, enum: ["capabilityId", "instanceId", "service"] }),
    intervalSeconds: z.int().min(60).max(3600),
});
const duration = z.number().min(0).max(86400000);
export const latencyOutputSchema = windowSchema.extend({
    method: contractString({ maxLength: 32, enum: ["histogram-upper-bound-v1"] }),
    relativeBucketWidth: z.number().min(0).max(1),
    minimumBucketWidthMs: z.number().min(0).max(1),
    intervalSeconds: z.int().min(60).max(3600),
    points: z
        .array(
            z.strictObject({
                from: contractString({ maxLength: 32, format: "date-time" }),
                to: contractString({ maxLength: 32, format: "date-time" }),
                key: contractString({ maxLength: 400 }),
                count: z.int().min(1).max(Number.MAX_SAFE_INTEGER),
                meanMs: duration,
                minMs: duration,
                maxMs: duration,
                p50Ms: duration,
                p95Ms: duration,
            }),
        )
        .max(500)
        .readonly(),
});
