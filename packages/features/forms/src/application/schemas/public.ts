import { contractString, z } from "@bernouy/ulvia-sdk";
import { accessModeSchema } from "forms/application/schemas/authoring";
import { fieldKindSchema, fieldsSchema, idSchema } from "forms/application/schemas/fields";

const uuid = contractString({ format: "uuid", maxLength: 36 });
export const answerSchema = z.strictObject({
    fieldId: idSchema,
    kind: fieldKindSchema,
    text: contractString({ maxLength: 65536 }).optional(),
    number: z.number().optional(),
    boolean: z.boolean().optional(),
    optionIds: z.array(idSchema).max(8192).optional(),
});
export const submissionInputSchema = z.strictObject({
    attemptId: uuid,
    formId: uuid,
    formVersion: z.int().min(1).max(Number.MAX_SAFE_INTEGER),
    answers: z.array(answerSchema).max(8192),
    honeypot: contractString({ maxLength: 65536 }).optional(),
});
export const submissionAckSchema = z.strictObject({ received: z.boolean(), receiptId: uuid });
export const publicDefinitionInputSchema = z.strictObject({ formId: uuid });
export const publicDefinitionSchema = z.strictObject({
    formId: uuid,
    formVersion: z.int().min(1).max(Number.MAX_SAFE_INTEGER),
    accessMode: accessModeSchema,
    locale: contractString({ minLength: 1, maxLength: 65536 }),
    title: contractString({ minLength: 1, maxLength: 65536 }),
    description: contractString({ maxLength: 65536 }).optional(),
    fields: fieldsSchema,
    accepting: z.boolean(),
    messages: z.strictObject({
        success: contractString({ maxLength: 65536 }),
        closed: contractString({ maxLength: 65536 }),
    }),
});
export type FormAnswer = z.infer<typeof answerSchema>;
export type SubmissionInput = z.infer<typeof submissionInputSchema>;
