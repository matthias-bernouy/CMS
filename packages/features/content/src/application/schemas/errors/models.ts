import { z } from "zod";
import { contractString } from "@bernouy/ulvia-sdk";
import { contentDiagnosticSchema } from "content/application/schemas/common";
export const messageErrorSchema = z
    .strictObject({
        message: contractString({ minLength: 1, maxLength: 2048 }),
    })
    .readonly();

export const pageValidationErrorSchema = z
    .strictObject({
        message: contractString({ minLength: 1, maxLength: 2048 }),
        diagnostics: z.array(contentDiagnosticSchema).max(16).readonly().optional(),
    })
    .readonly();
