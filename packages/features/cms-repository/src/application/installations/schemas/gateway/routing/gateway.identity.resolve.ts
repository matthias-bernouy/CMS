import { z } from "zod";
import { contractString } from "@bernouy/ulvia-sdk";
export const gatewayIdentityResolveInputSchema = z.strictObject({
    providerId: contractString({ minLength: 1, maxLength: 193 }),
    subjectId: contractString({ minLength: 1, maxLength: 256 }),
});

export const gatewayIdentityResolveOutputSchema = z.strictObject({
    providerSubjectId: contractString({ minLength: 1, maxLength: 256 }),
});
