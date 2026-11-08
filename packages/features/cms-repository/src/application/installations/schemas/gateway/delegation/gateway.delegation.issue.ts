import { z } from "zod";
import { contractString } from "@bernouy/ulvia-sdk";
export const gatewayDelegationIssueInputSchema = z.strictObject({
    source: z.strictObject({
        siteId: contractString({ minLength: 1, maxLength: 128 }),
        requestId: contractString({ minLength: 1, maxLength: 128 }),
        installationId: contractString({ minLength: 1, maxLength: 128 }),
        contractId: contractString({ minLength: 1, maxLength: 193 }),
        version: contractString({ minLength: 1, maxLength: 128 }),
        digest: contractString({ minLength: 1, maxLength: 128 }),
        capabilityId: contractString({ minLength: 1, maxLength: 128 }),
        actor: z.strictObject({
            kind: contractString({ enum: ["anonymous", "user", "administrator"], maxLength: 13 }),
            subjectId: contractString({ minLength: 1, maxLength: 256, sensitive: true }).optional(),
            authorizationRevision: z.int().min(0).optional(),
        }),
        deadline: z.int().min(0),
    }),
});

export const gatewayDelegationIssueOutputSchema = z.strictObject({
    delegation: z
        .strictObject({
            ticket: contractString({ minLength: 1, maxLength: 43, sensitive: true }),
            expiresAt: z.int().min(0),
        })
        .nullable(),
});
