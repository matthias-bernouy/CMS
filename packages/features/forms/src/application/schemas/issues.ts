import { contractString, z } from "@bernouy/ulvia-sdk";
import { idSchema } from "forms/application/schemas/fields";

export const validationReasons = [
    "MALFORMED",
    "INVALID_FIELD",
    "DUPLICATE_FIELD",
    "INVALID_CONFIGURATION",
    "UNKNOWN_FIELD",
    "DUPLICATE_ANSWER",
    "KIND_MISMATCH",
    "INVALID_VALUE",
    "INVALID_DATE",
    "UNKNOWN_OPTION",
    "DUPLICATE_OPTION",
    "SELECTION_COUNT",
    "MISSING_REQUIRED",
] as const;
export const validationIssueSchema = z.strictObject({
    reason: contractString({ enum: validationReasons, maxLength: 32 }),
    fieldId: idSchema.optional(),
});
export type ValidationIssue = z.infer<typeof validationIssueSchema>;
export type ValidationReason = ValidationIssue["reason"];
