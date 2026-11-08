import { z } from "zod";
import { contractString } from "@bernouy/ulvia-sdk";
export const gatewayProviderPrepareInputSchema = z.strictObject({
    invocation: z.strictObject({
        requestId: contractString({ minLength: 36, maxLength: 36 }),
        installationId: contractString({ minLength: 1, maxLength: 160 }),
        contractId: contractString({ minLength: 1, maxLength: 193 }),
        contractVersion: contractString({ minLength: 5, maxLength: 64 }),
        capabilityId: contractString({ minLength: 1, maxLength: 160 }),
        bodyBytes: z.int().min(0).max(67108864).optional(),
        trace: z
            .strictObject({
                traceId: contractString({ minLength: 36, maxLength: 36 }),
                spanId: contractString({ minLength: 36, maxLength: 36 }),
                parentSpanId: contractString({ minLength: 36, maxLength: 36 }).optional(),
            })
            .optional(),
    }),
    token: contractString({ minLength: 32, maxLength: 4096 }),
    deadline: z.int().min(0),
    closedDelegations: z
        .array(
            z.strictObject({
                ticket: contractString({ minLength: 43, maxLength: 43, sensitive: true }),
                requestId: contractString({ minLength: 36, maxLength: 36 }),
            }),
        )
        .max(64)
        .readonly()
        .optional(),
});

export const gatewayProviderPrepareOutputSchema = z.strictObject({
    token: contractString({ sensitive: true, minLength: 20, maxLength: 4096 }),
    instanceId: contractString({ minLength: 1, maxLength: 160 }),
    delegation: z
        .strictObject({
            ticket: contractString({ minLength: 1, maxLength: 43, sensitive: true }),
            expiresAt: z.int().min(0),
        })
        .nullable(),
    sourceInstallationId: contractString({ minLength: 1, maxLength: 128 }),
});
