import { z } from "zod";
import { contractString } from "@bernouy/ulvia-sdk";
export const pairProviderConnectionInputSchema = z.strictObject({
    installationId: contractString({ maxLength: 128 }),
    expectedRevision: z.int().min(0).max(9007199254740991),
    rotate: z.boolean().optional(),
});

export const pairProviderConnectionOutputSchema = z.strictObject({
    installationId: contractString({ maxLength: 128 }),
    paired: z.boolean(),
});
