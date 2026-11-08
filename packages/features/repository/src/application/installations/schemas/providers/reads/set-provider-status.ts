import { z } from "zod";
import { contractString } from "@bernouy/ulvia-sdk";
export const setProviderStatusInputSchema = z.strictObject({
    installationId: contractString({ minLength: 1, maxLength: 96 }),
    expectedRevision: z.int().min(1).max(9007199254740991),
    action: contractString({ enum: ["enable", "disable", "revoke"], maxLength: 7 }),
});

export const setProviderStatusOutputSchema = z.strictObject({
    installationId: contractString({ maxLength: 96 }),
    status: contractString({ enum: ["enabled", "disabled", "revoked"], maxLength: 8 }),
    revision: z.int().min(1).max(9007199254740991),
    credentialsDeleted: z.boolean(),
});
