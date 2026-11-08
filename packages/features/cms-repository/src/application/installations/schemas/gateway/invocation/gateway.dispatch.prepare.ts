import { z } from "zod";
import { contractString } from "@bernouy/ulvia-sdk";
export const gatewayDispatchPrepareInputSchema = z.strictObject({
    invocation: z.strictObject({
        requestId: contractString({ minLength: 36, maxLength: 36 }),
        installationId: contractString({ minLength: 1, maxLength: 160 }),
        contractId: contractString({ minLength: 1, maxLength: 193 }),
        contractVersion: contractString({ minLength: 5, maxLength: 64 }),
        capabilityId: contractString({ minLength: 1, maxLength: 160 }),
        systemServiceId: contractString({ maxLength: 128 }).optional(),
        sourceInstallationId: contractString({ maxLength: 128 }).optional(),
        bodyBytes: z.int().min(0).max(67108864).optional(),
        delegatedTicket: contractString({ minLength: 1, maxLength: 43, sensitive: true }).optional(),
        sourceCredentialFingerprint: contractString({ minLength: 64, maxLength: 64 }).optional(),
        trace: z
            .strictObject({
                traceId: contractString({ minLength: 36, maxLength: 36 }),
                spanId: contractString({ minLength: 36, maxLength: 36 }),
                parentSpanId: contractString({ minLength: 36, maxLength: 36 }).optional(),
            })
            .optional(),
    }),
    actor: z.strictObject({
        kind: contractString({
            enum: ["anonymous", "user", "administrator", "provider", "system"],
            maxLength: 13,
        }),
        subjectId: contractString({ minLength: 1, maxLength: 256, sensitive: true }).optional(),
        authorizationRevision: z.int().min(0).optional(),
        installationId: contractString({ minLength: 1, maxLength: 128 }).optional(),
        credentialFingerprint: contractString({ minLength: 64, maxLength: 64, sensitive: true }).optional(),
        serviceId: contractString({ minLength: 1, maxLength: 128 }).optional(),
    }),
    deadline: z.int().min(0),
    expectedSubjectId: contractString({ minLength: 1, maxLength: 256, sensitive: true }).optional(),
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

export const gatewayDispatchPrepareOutputSchema = z.strictObject({
    token: contractString({ sensitive: true, minLength: 20, maxLength: 4096 }),
    instanceId: contractString({ minLength: 1, maxLength: 160 }),
    delegation: z
        .strictObject({
            ticket: contractString({ minLength: 1, maxLength: 43, sensitive: true }),
            expiresAt: z.int().min(0),
        })
        .nullable(),
});
