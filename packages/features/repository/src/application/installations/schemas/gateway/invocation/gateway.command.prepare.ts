import { z } from "zod";
import { contractString } from "@bernouy/ulvia-sdk";
import { gatewayDispatchPrepareInputSchema, gatewayDispatchPrepareOutputSchema } from "./gateway.dispatch.prepare";

export const gatewayCommandPrepareInputSchema = gatewayDispatchPrepareInputSchema.extend({
    commandStart: z.strictObject({
        providerId: contractString({ minLength: 1, maxLength: 193 }),
        identityRequired: z.boolean(),
        event: contractString({ minLength: 1, maxLength: 65536 }),
    }),
});
export const gatewayCommandPrepareOutputSchema = z.strictObject({
    prepared: gatewayDispatchPrepareOutputSchema.nullable(),
    failure: z
        .strictObject({
            stage: contractString({ enum: ["identity", "audit", "preparation"], maxLength: 11 }),
            status: z.int().min(400).max(599),
        })
        .nullable(),
});
