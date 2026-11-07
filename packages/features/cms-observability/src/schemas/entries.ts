import { z } from "zod";
import { contractString, contractMap } from "@bernouy/ulvia-sdk";
export const logLevelSchema = contractString({
    maxLength: 5,
    enum: ["trace", "debug", "info", "warn", "error", "fatal"],
});
export const logDetailSchema = z
    .strictObject({
        id: contractString({ maxLength: 36, format: "uuid" }),
        time: contractString({ maxLength: 32, format: "date-time" }),
        level: logLevelSchema,
        event: contractString({ maxLength: 128 }),
        instanceId: contractString({ maxLength: 128 }),
        service: contractString({ maxLength: 128 }),
        receivedAt: contractString({ maxLength: 32, format: "date-time" }),
        attributes: contractMap(contractString({ maxLength: 1024 }), {
            maxKeyLength: 128,
            maxProperties: 24,
        }).readonly(),
        component: contractString({ maxLength: 128 }).optional(),
        requestId: contractString({ maxLength: 128 }).optional(),
        invocationId: contractString({ maxLength: 128 }).optional(),
        contractId: contractString({ maxLength: 193 }).optional(),
        capabilityId: contractString({ maxLength: 128 }).optional(),
        durationMs: z.number().min(0).max(86400000).optional(),
        error: z
            .strictObject({
                name: contractString({ maxLength: 2048 }),
                message: contractString({ maxLength: 2048 }),
                stack: contractString({ maxLength: 2048 }).optional(),
            })
            .readonly()
            .optional(),
        sourceEntryId: contractString({ maxLength: 36, format: "uuid" }).optional(),
        traceId: contractString({ maxLength: 128 }).optional(),
        parentInvocationId: contractString({ maxLength: 128 }).optional(),
    })
    .readonly();
export const logEntrySchema = logDetailSchema
    .unwrap()
    .omit({ instanceId: true, service: true, receivedAt: true, sourceEntryId: true })
    .readonly();
export const logSummarySchema = logDetailSchema.unwrap().omit({ attributes: true, error: true }).readonly();
