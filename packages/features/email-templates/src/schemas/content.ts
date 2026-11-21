import { contractString, z } from "@bernouy/ulvia-sdk";

export const idSchema = contractString({ format: "uuid", maxLength: 36 });
export const revisionSchema = z.number().int().min(0).max(Number.MAX_SAFE_INTEGER);
const variableSchema = z.strictObject({
    name: contractString({ minLength: 1, maxLength: 64 }),
    kind: contractString({ enum: ["text", "url", "date-time"], maxLength: 9 }),
    required: z.boolean(),
});
export const contentSchema = z.strictObject({
    subject: contractString({ minLength: 1, maxLength: 500, sensitive: true }),
    text: contractString({ minLength: 1, maxLength: 32768, sensitive: true }),
    html: contractString({ minLength: 1, maxLength: 32768, sensitive: true }).optional(),
    variables: z.array(variableSchema).max(32),
});
export const valueSchema = z.strictObject({
    name: contractString({ minLength: 1, maxLength: 64 }),
    value: contractString({ maxLength: 8192, sensitive: true }),
});
export const renderedSchema = z.strictObject({
    subject: contractString({ minLength: 1, maxLength: 998, sensitive: true }),
    text: contractString({ minLength: 1, maxLength: 131072, sensitive: true }),
    html: contractString({ minLength: 1, maxLength: 131072, sensitive: true }).optional(),
});
export type TemplateContent = z.infer<typeof contentSchema>;
export type TemplateValues = z.infer<typeof valueSchema>[];
