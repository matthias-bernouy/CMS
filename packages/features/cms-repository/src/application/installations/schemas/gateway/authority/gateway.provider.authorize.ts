import { z } from "zod";
import { contractString } from "@bernouy/ulvia-sdk";
export const gatewayProviderAuthorizeInputSchema = z.strictObject({
    sourceInstallationId: contractString({ maxLength: 128 }),
    targetInstallationId: contractString({ maxLength: 128 }),
    contractId: contractString({ maxLength: 193 }),
    capabilityId: contractString({ maxLength: 128 }),
    version: contractString({ maxLength: 128 }),
    sourceCredentialFingerprint: contractString({ minLength: 64, maxLength: 64 }),
});

export const gatewayProviderAuthorizeOutputSchema = z.strictObject({
    allowed: z.boolean(),
});
