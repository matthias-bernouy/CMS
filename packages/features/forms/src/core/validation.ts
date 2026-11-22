import { lossless } from "forms/core/inputBounds";
import { contractString } from "@bernouy/ulvia-sdk";
import { answerSchema } from "forms/application/schemas/public";
import type { FormField } from "forms/application/schemas/fields";
import type { FormAnswer } from "forms/application/schemas/public";

import { fail } from "forms/core/validationError";
import { validateFields } from "forms/core/fieldValidation";
import { validDate } from "forms/core/validationDate";
export { validateFields } from "forms/core/fieldValidation";
export { FormsValidationError } from "forms/core/validationError";
const emailSchema = contractString({ format: "email", maxLength: 320 });
export function validateAnswers(
    fields: readonly FormField[],
    input: readonly unknown[],
): asserts input is readonly FormAnswer[] {
    validateFields(fields);
    if (!lossless(input)) {
        fail("MALFORMED");
    }
    const seen = new Set<string>();
    const byId = new Map(fields.map((field) => [field.id, field]));
    for (const raw of input) {
        const parsed = answerSchema.safeParse(raw);
        if (!parsed.success) {
            const candidate = typeof raw === "object" && raw !== null && "fieldId" in raw ? raw.fieldId : undefined;
            const field = typeof candidate === "string" ? byId.get(candidate) : undefined;
            fail("MALFORMED", field?.id);
        }
        const answer = parsed.data;
        const field = byId.get(answer.fieldId);
        if (!field) {
            fail("UNKNOWN_FIELD", answer.fieldId);
        }
        if (seen.has(answer.fieldId)) {
            fail("DUPLICATE_ANSWER", field.id);
        }
        if (field.kind !== answer.kind) {
            fail("KIND_MISMATCH", field.id);
        }
        seen.add(answer.fieldId);
        const key =
            field.kind === "number"
                ? "number"
                : ["checkbox", "consent"].includes(field.kind)
                  ? "boolean"
                  : field.kind.endsWith("choice")
                    ? "optionIds"
                    : "text";
        if (
            ["text", "number", "boolean", "optionIds"].filter((name) => Object.hasOwn(answer, name)).length !== 1 ||
            !Object.hasOwn(answer, key) ||
            answer[key as "text" | "number" | "boolean" | "optionIds"] === undefined
        ) {
            fail("INVALID_VALUE", field.id);
        }
        if (answer.text !== undefined) {
            const text = answer.text;
            if (
                text.length < (field.minLength ?? 0) ||
                text.length > (field.maxLength ?? (field.kind === "email" ? 320 : 65536))
            ) {
                fail("INVALID_VALUE", field.id);
            }
            if (field.kind === "email" && !emailSchema.safeParse(text).success) {
                fail("INVALID_VALUE", field.id);
            }
            if (field.kind === "url") {
                try {
                    if (!["http:", "https:"].includes(new URL(text).protocol)) {
                        fail("INVALID_VALUE", field.id);
                    }
                } catch {
                    fail("INVALID_VALUE", field.id);
                }
            }
            if (
                field.kind === "date" &&
                (!validDate(text) || (field.minDate && text < field.minDate) || (field.maxDate && text > field.maxDate))
            ) {
                fail("INVALID_DATE", field.id);
            }
        }
        if (
            answer.number !== undefined &&
            (!Number.isFinite(answer.number) ||
                (field.integerOnly && !Number.isInteger(answer.number)) ||
                (field.min !== undefined && answer.number < field.min) ||
                (field.max !== undefined && answer.number > field.max))
        ) {
            fail("INVALID_VALUE", field.id);
        }
        if (answer.boolean === false && (field.mustBeTrue || (field.kind === "consent" && field.required))) {
            fail("INVALID_VALUE", field.id);
        }
        if (answer.optionIds) {
            if (new Set(answer.optionIds).size !== answer.optionIds.length) {
                fail("DUPLICATE_OPTION", field.id);
            }
            const options = new Set(field.options?.map((option) => option.id));
            if (answer.optionIds.some((id) => !options.has(id))) {
                fail("UNKNOWN_OPTION", field.id);
            }
            if (
                (field.kind === "single-choice" && answer.optionIds.length !== 1) ||
                answer.optionIds.length < (field.minSelections ?? 0) ||
                answer.optionIds.length > (field.maxSelections ?? 65536)
            ) {
                fail("SELECTION_COUNT", field.id);
            }
        }
    }
    const missing = fields.find((field) => field.required && !seen.has(field.id));
    if (missing) {
        fail("MISSING_REQUIRED", missing.id);
    }
}
