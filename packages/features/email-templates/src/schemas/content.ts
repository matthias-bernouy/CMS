import { TEMPLATE_LIMITS } from "email-templates/core/limits";
import { contractString, z } from "@bernouy/ulvia-sdk";

export const idSchema = contractString({ format: "uuid", maxLength: 36 });
export const revisionSchema = z.number().int().min(0).max(Number.MAX_SAFE_INTEGER);
const variableSchema = z.strictObject({
    name: contractString({ minLength: 1, maxLength: 64 }),
    kind: contractString({ enum: ["text", "url", "date-time"], maxLength: 9 }),
    required: z.boolean(),
});
export const contentSchema = z.strictObject({
    subject: contractString({ minLength: 1, maxLength: TEMPLATE_LIMITS.sourceSubjectMaxCodeUnits, sensitive: true }),
    text: contractString({ minLength: 1, maxLength: TEMPLATE_LIMITS.sourceBodyMaxCodeUnits, sensitive: true }),
    html: contractString({
        minLength: 1,
        maxLength: TEMPLATE_LIMITS.sourceBodyMaxCodeUnits,
        sensitive: true,
    }).optional(),
    variables: z.array(variableSchema).max(TEMPLATE_LIMITS.variableCount),
});
export const valueSchema = z.strictObject({
    name: contractString({ minLength: 1, maxLength: 64 }),
    value: contractString({ maxLength: TEMPLATE_LIMITS.variableValueMaxCodeUnits, sensitive: true }),
});
export const renderedSchema = z.strictObject({
    subject: contractString({ minLength: 1, maxLength: TEMPLATE_LIMITS.renderedSubjectMaxCodeUnits, sensitive: true }),
    text: contractString({ minLength: 1, maxLength: TEMPLATE_LIMITS.renderedBodyMaxCodeUnits, sensitive: true }),
    html: contractString({
        minLength: 1,
        maxLength: TEMPLATE_LIMITS.renderedBodyMaxCodeUnits,
        sensitive: true,
    }).optional(),
});
export type TemplateContent = z.infer<typeof contentSchema>;
export type TemplateValues = z.infer<typeof valueSchema>[];
