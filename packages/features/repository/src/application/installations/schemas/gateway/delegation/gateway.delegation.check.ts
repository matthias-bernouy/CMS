import { z } from "zod";
import { contractString } from "@bernouy/ulvia-sdk";
export const gatewayDelegationCheckInputSchema = z.strictObject({
    target: z.strictObject({
        siteId: contractString({ minLength: 1, maxLength: 128 }),
        sourceInstallationId: contractString({ minLength: 1, maxLength: 128 }),
        contractId: contractString({ minLength: 1, maxLength: 193 }),
        capabilityId: contractString({ minLength: 1, maxLength: 128 }),
        ticket: contractString({ minLength: 1, maxLength: 43, sensitive: true }),
        sourceCredentialFingerprint: contractString({ minLength: 64, maxLength: 64 }),
    }),
});

export const gatewayDelegationCheckOutputSchema = z.strictObject({
    actor: z.strictObject({
        kind: contractString({ enum: ["anonymous", "user", "administrator"], maxLength: 13 }),
        subjectId: contractString({ minLength: 1, maxLength: 256, sensitive: true }).optional(),
        authorizationRevision: z.int().min(0).optional(),
    }),
    rootRequestId: contractString({ minLength: 1, maxLength: 128 }),
});
