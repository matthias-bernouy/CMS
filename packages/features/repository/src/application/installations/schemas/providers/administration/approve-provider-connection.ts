import { z } from "zod";
import { contractString } from "@bernouy/ulvia-sdk";
export const approveProviderConnectionInputSchema = z.strictObject({
    ticket: contractString({ maxLength: 128 }),
});

export const approveProviderConnectionOutputSchema = z.strictObject({
    installationId: contractString({ maxLength: 128 }),
    providerId: contractString({ maxLength: 193 }),
    operation: contractString({ maxLength: 128 }),
    observed: z.boolean(),
});
