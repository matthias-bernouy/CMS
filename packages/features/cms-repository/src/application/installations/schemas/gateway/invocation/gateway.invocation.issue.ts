import { z } from "zod";
import { contractString } from "@bernouy/ulvia-sdk";
export const gatewayInvocationIssueInputSchema = z.strictObject({
    requestId: contractString({ minLength: 36, maxLength: 36 }),
    installationId: contractString({ minLength: 1, maxLength: 160 }),
    contractId: contractString({ minLength: 1, maxLength: 193 }),
    contractVersion: contractString({ minLength: 5, maxLength: 64 }),
    capabilityId: contractString({ minLength: 1, maxLength: 160 }),
    subjectId: contractString({ minLength: 1, maxLength: 256 }).nullable().optional(),
    systemServiceId: contractString({ maxLength: 128 }).optional(),
    sourceInstallationId: contractString({ maxLength: 128 }).optional(),
    bodyBytes: z.int().min(0).max(67108864).optional(),
    delegation: z
        .strictObject({
            ticket: contractString({ minLength: 1, maxLength: 43, sensitive: true }),
            expiresAt: z.int().min(0),
        })
        .optional(),
    delegatedTicket: contractString({ minLength: 1, maxLength: 43, sensitive: true }).optional(),
    sourceCredentialFingerprint: contractString({ minLength: 64, maxLength: 64 }).optional(),
    trace: z
        .strictObject({
            traceId: contractString({ minLength: 36, maxLength: 36 }),
            spanId: contractString({ minLength: 36, maxLength: 36 }),
            parentSpanId: contractString({ minLength: 36, maxLength: 36 }).optional(),
        })
        .optional(),
    actorKind: contractString({ enum: ["anonymous", "user", "administrator"], maxLength: 13 }).optional(),
});

export const gatewayInvocationIssueOutputSchema = z.strictObject({
    token: contractString({ sensitive: true, minLength: 20, maxLength: 4096 }),
    instanceId: contractString({ minLength: 1, maxLength: 160 }),
});
