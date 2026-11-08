import { z } from "zod";
import { contractString } from "@bernouy/ulvia-sdk";
export const emptyInputSchema = z.strictObject({});

export const contentDiagnosticSchema = z
    .strictObject({
        code: contractString({ maxLength: 128 }),
        severity: contractString({ enum: ["error", "warning"], maxLength: 7 }),
        message: contractString({ maxLength: 2048 }),
        location: z
            .strictObject({
                blocId: contractString({ maxLength: 512 }).optional(),
                path: contractString({ maxLength: 2048 }).optional(),
                attribute: contractString({ maxLength: 64 }).optional(),
            })
            .readonly()
            .optional(),
        relatedResources: z
            .array(contractString({ maxLength: 200 }))
            .max(8)
            .readonly()
            .optional(),
        suggestion: contractString({ maxLength: 512 }).optional(),
    })
    .readonly();
