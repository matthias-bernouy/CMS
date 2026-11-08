import { z } from "zod";
import { contractString } from "@bernouy/ulvia-sdk";
import { logLevelSchema, logSummarySchema } from "./entries";
export const logGroupSchema = contractString({
    maxLength: 32,
    enum: ["level", "service", "event", "component", "contractId", "capabilityId"],
});
export const queryLogsInputSchema = z.strictObject({
    from: contractString({ maxLength: 32 }).optional(),
    to: contractString({ maxLength: 32 }).optional(),
    levels: z.array(logLevelSchema).max(6).readonly().optional(),
    service: contractString({ maxLength: 128 }).optional(),
    component: contractString({ maxLength: 128 }).optional(),
    event: contractString({ maxLength: 128 }).optional(),
    eventPrefix: contractString({ maxLength: 128 }).optional(),
    requestId: contractString({ maxLength: 128 }).optional(),
    invocationId: contractString({ maxLength: 128 }).optional(),
    contractId: contractString({ maxLength: 193 }).optional(),
    capabilityId: contractString({ maxLength: 128 }).optional(),
    limit: z.int().min(1).max(200).optional(),
    cursor: contractString({ maxLength: 1600 }).optional(),
    minLevel: contractString({ maxLength: 5 }).optional(),
    timeField: contractString({ maxLength: 10, enum: ["time", "receivedAt"] }).optional(),
    traceId: contractString({ maxLength: 128 }).optional(),
    parentInvocationId: contractString({ maxLength: 128 }).optional(),
});
export const queryLogsOutputSchema = z
    .strictObject({
        items: z.array(logSummarySchema).max(200).readonly(),
        nextCursor: contractString({ maxLength: 1600 }).nullable(),
        from: contractString({ maxLength: 32, format: "date-time" }),
        to: contractString({ maxLength: 32, format: "date-time" }),
    })
    .readonly();
export const aggregateLogsInputSchema = queryLogsInputSchema
    .omit({ limit: true, cursor: true })
    .extend({ groupBy: logGroupSchema });
export const aggregateLogsOutputSchema = z
    .strictObject({
        total: z.int().min(0).max(9007199254740991),
        groups: z
            .array(
                z
                    .strictObject({
                        key: contractString({ maxLength: 128 }),
                        count: z.int().min(0).max(9007199254740991),
                    })
                    .readonly(),
            )
            .max(50)
            .readonly(),
        truncated: z.boolean(),
    })
    .readonly();
export const getLogsInputSchema = z.strictObject({
    id: contractString({ maxLength: 36, format: "uuid" }),
});
export const logQuerySchema = queryLogsInputSchema.extend({ minLevel: logLevelSchema.optional() }).readonly();
