import { z } from "zod";
import { contractString } from "@bernouy/ulvia-sdk";
export const listSiteUsageInputSchema = z.strictObject({
    cursor: contractString({ maxLength: 96 }).optional(),
    limit: z.int().min(1).max(500).optional(),
});

export const listSiteUsageOutputSchema = z.strictObject({
    complete: z.boolean(),
    digest: contractString({ maxLength: 71 }),
    unknown: z
        .array(contractString({ maxLength: 4096 }))
        .max(1024)
        .readonly(),
    unknownCount: z.int().min(0).max(9007199254740991),
    total: z.int().min(0).max(9007199254740991),
    references: z
        .array(
            z.strictObject({
                type: contractString({ maxLength: 16 }),
                scope: contractString({ maxLength: 16 }),
                location: contractString({ maxLength: 4096 }),
                collectionId: contractString({ maxLength: 193 }).optional(),
                kind: contractString({ maxLength: 32 }).optional(),
                id: contractString({ maxLength: 512 }).optional(),
                contractId: contractString({ maxLength: 193 }).optional(),
                capabilityId: contractString({ maxLength: 96 }).optional(),
                bindingPath: contractString({ maxLength: 4096 }).optional(),
                versionRange: contractString({ maxLength: 512 }).optional(),
            }),
        )
        .max(500)
        .readonly(),
    cursor: contractString({ maxLength: 96 }).optional(),
});
