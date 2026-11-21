import { z } from "zod";
import { contractString } from "@bernouy/ulvia-sdk";
import { logDetailSchema, logSummarySchema } from "observability/schemas/entries";
import { queryLogsInputSchema } from "observability/schemas/queries";

const instanceIdSchema = contractString({ minLength: 1, maxLength: 128 });
export const clusterFiltersSchema = queryLogsInputSchema.omit({ cursor: true, limit: true }).extend({
    instanceIds: z.array(instanceIdSchema).min(1).max(16).readonly(),
});
export const sourceSchema = z.strictObject({
    instanceId: instanceIdSchema,
    status: contractString({ maxLength: 16, enum: ["available", "unavailable", "unsupported", "limit_exceeded"] }),
});
const coverageSchema = z.strictObject({
    sources: z.array(sourceSchema).max(16).readonly(),
    partial: z.boolean(),
});
export const windowSchema = coverageSchema.extend({
    from: contractString({ maxLength: 32, format: "date-time" }),
    to: contractString({ maxLength: 32, format: "date-time" }),
});
export const clusterQueryInputSchema = clusterFiltersSchema.extend({
    limit: z.int().min(1).max(200).optional(),
    cursor: contractString({ maxLength: 6000 }).optional(),
});
export const clusterQueryOutputSchema = windowSchema.extend({
    items: z.array(logSummarySchema).max(200).readonly(),
    nextCursor: contractString({ maxLength: 6000 }).nullable(),
});
export const clusterGetInputSchema = z.strictObject({
    instanceId: instanceIdSchema,
    id: contractString({ maxLength: 36, format: "uuid" }),
});
export const clusterGetOutputSchema = coverageSchema.extend({ entry: logDetailSchema.nullable() });
export const clusterAggregateInputSchema = clusterFiltersSchema.extend({
    groupBy: contractString({
        maxLength: 32,
        enum: ["level", "service", "event", "component", "contractId", "capabilityId", "instanceId"],
    }),
});
export const clusterAggregateOutputSchema = windowSchema.extend({
    total: z.int().min(0).max(Number.MAX_SAFE_INTEGER),
    groups: z
        .array(
            z.strictObject({
                key: contractString({ maxLength: 193 }),
                count: z.int().min(0).max(Number.MAX_SAFE_INTEGER),
            }),
        )
        .max(50)
        .readonly(),
    truncated: z.boolean(),
});
