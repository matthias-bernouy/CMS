import { contractString, z } from "@bernouy/ulvia-sdk";

export const fieldKinds = [
    "text",
    "textarea",
    "email",
    "tel",
    "url",
    "number",
    "date",
    "checkbox",
    "single-choice",
    "multiple-choice",
    "consent",
] as const;
export const idSchema = contractString({ minLength: 1, maxLength: 64 });
export const fieldKindSchema = contractString({ enum: fieldKinds, maxLength: 15 });
const optionSchema = z.strictObject({ id: idSchema, label: contractString({ minLength: 1, maxLength: 65536 }) });
export const fieldSchema = z.strictObject({
    id: idSchema,
    kind: fieldKindSchema,
    label: contractString({ minLength: 1, maxLength: 65536 }),
    helpText: contractString({ maxLength: 65536 }).optional(),
    required: z.boolean().optional(),
    minLength: z.int().min(0).max(Number.MAX_SAFE_INTEGER).optional(),
    maxLength: z.int().min(0).max(Number.MAX_SAFE_INTEGER).optional(),
    min: z.number().optional(),
    max: z.number().optional(),
    integerOnly: z.boolean().optional(),
    minDate: contractString({ maxLength: 10 }).optional(),
    maxDate: contractString({ maxLength: 10 }).optional(),
    mustBeTrue: z.boolean().optional(),
    statement: contractString({ minLength: 1, maxLength: 65536 }).optional(),
    options: z.array(optionSchema).max(8192).optional(),
    minSelections: z.int().min(0).max(Number.MAX_SAFE_INTEGER).optional(),
    maxSelections: z.int().min(0).max(Number.MAX_SAFE_INTEGER).optional(),
});
export const fieldsSchema = z.array(fieldSchema).max(8192);
export type FormField = z.infer<typeof fieldSchema>;
