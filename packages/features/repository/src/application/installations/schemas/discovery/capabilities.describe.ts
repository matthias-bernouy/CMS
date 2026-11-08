import { z } from "zod";
import { contractString } from "@bernouy/ulvia-sdk";
export const capabilitiesDescribeInputSchema = z.strictObject({
    contractId: contractString({ minLength: 1, maxLength: 193 }),
});

export const capabilitiesDescribeOutputSchema = z.strictObject({
    found: z.boolean(),
    version: contractString({ maxLength: 64 }),
    capabilities: z
        .array(
            z.strictObject({
                id: contractString({ maxLength: 128 }),
                access: contractString({ enum: ["public", "authenticated", "admin"], maxLength: 13 }),
                effect: contractString({ enum: ["query", "command"], maxLength: 7 }),
                sensitive: z.boolean(),
                docs: z
                    .array(contractString({ maxLength: 256 }))
                    .max(16)
                    .readonly()
                    .optional(),
            }),
        )
        .max(256)
        .readonly(),
});
