import { z } from "zod";
import { contractString } from "@bernouy/ulvia-sdk";
export const getProviderAccessInputSchema = z.strictObject({
    installationId: contractString({ maxLength: 128 }),
});

export const getProviderAccessOutputSchema = z.strictObject({
    installationId: contractString({ maxLength: 128 }),
    providerId: contractString({ maxLength: 193 }),
    revision: z.int().min(0).max(9007199254740991),
    paired: z.boolean(),
    requests: z
        .array(
            z.strictObject({
                contractId: contractString({ maxLength: 193 }),
                capabilityId: contractString({ maxLength: 128 }),
                versionRange: contractString({ maxLength: 256 }),
                optional: z.boolean(),
                selected: z.boolean(),
            }),
        )
        .max(10000)
        .readonly(),
    endpoint: contractString({ maxLength: 2048 }),
    manifestVersion: contractString({ maxLength: 128 }),
});
