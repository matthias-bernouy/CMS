import { createHash } from "node:crypto";
import { schemaDescriptorWire } from "@bernouy/ulvia-contracts/resolution";
import type { UlviaObjectSchema, UlviaSchema } from "@bernouy/ulvia-contracts/schema";
import type { FormField } from "forms/application/schemas/fields";
import type { FormAnswer } from "forms/application/schemas/public";
import { validateAnswers } from "forms/core/validation";

export function answerProperty(id: string): string {
    return /^[A-Za-z][A-Za-z0-9_]{0,63}$/u.test(id)
        ? id
        : `field_${createHash("sha256").update(id).digest("hex").slice(0, 48)}`;
}
export function describeSubmissionFields(formId: string, version: number, fields: readonly FormField[]) {
    const properties: Record<string, UlviaSchema> = Object.create(null);
    for (const field of fields) {
        const property = answerProperty(field.id);
        if (Object.hasOwn(properties, property)) {
            throw new TypeError("Form field schema identities collide");
        }
        properties[property] = fieldSchema(field);
    }
    const schema: UlviaObjectSchema = {
        type: "object",
        properties,
        required: fields.filter((field) => field.required).map((field) => answerProperty(field.id)),
    };
    const descriptors = fields.map((field) => ({
        id: field.id,
        property: answerProperty(field.id),
        label: field.label,
        sensitive: field.sensitive === true,
    }));
    return schemaDescriptorWire({ resourceId: formId, version: String(version), schema, fields: descriptors });
}
export function submissionValues(fields: readonly FormField[], answers: readonly FormAnswer[]) {
    validateAnswers(fields, answers);
    return Object.fromEntries(
        answers.map((answer) => [
            answerProperty(answer.fieldId),
            answer.kind === "number"
                ? answer.number
                : answer.kind === "checkbox" || answer.kind === "consent"
                  ? answer.boolean
                  : answer.kind === "single-choice"
                    ? answer.optionIds![0]
                    : answer.kind === "multiple-choice"
                      ? answer.optionIds
                      : answer.text,
        ]),
    );
}
function fieldSchema(field: FormField): UlviaSchema {
    switch (field.kind) {
        case "number":
            return {
                type: field.integerOnly ? "integer" : "number",
                ...(field.min === undefined ? {} : { minimum: field.min }),
                ...(field.max === undefined ? {} : { maximum: field.max }),
            };
        case "checkbox":
        case "consent":
            return { type: "boolean" };
        case "single-choice":
            return { type: "string", maxLength: 64, enum: field.options!.map(({ id }) => id) };
        case "multiple-choice":
            return {
                type: "array",
                items: { type: "string", maxLength: 64, enum: field.options!.map(({ id }) => id) },
                maxItems: field.maxSelections ?? field.options!.length,
                minItems: field.minSelections ?? 0,
            };
        default:
            return {
                type: "string",
                maxLength: field.maxLength ?? (field.kind === "email" ? 320 : 65536),
                ...(field.minLength === undefined ? {} : { minLength: field.minLength }),
                ...(field.kind === "email"
                    ? { format: "email" }
                    : field.kind === "date"
                      ? { format: "date" }
                      : field.kind === "url"
                        ? { format: "uri" }
                        : {}),
            };
    }
}
