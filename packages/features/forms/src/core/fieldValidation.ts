import { lossless } from "forms/core/inputBounds";
import { fieldsSchema } from "forms/application/schemas/fields";
import type { FormField } from "forms/application/schemas/fields";
import { fail, idValid } from "forms/core/validationError";
import { validDate } from "forms/core/validationDate";

const kindProperties: Record<FormField["kind"], readonly string[]> = {
    text: ["minLength", "maxLength"],
    textarea: ["minLength", "maxLength"],
    email: ["minLength", "maxLength"],
    tel: ["minLength", "maxLength"],
    url: ["minLength", "maxLength"],
    number: ["min", "max", "integerOnly"],
    date: ["minDate", "maxDate"],
    checkbox: ["mustBeTrue"],
    consent: ["mustBeTrue", "statement"],
    "single-choice": ["options"],
    "multiple-choice": ["options", "minSelections", "maxSelections"],
};
const base = ["id", "kind", "label", "helpText", "required"];
export function validateFields(input: readonly unknown[]): asserts input is readonly FormField[] {
    const parsed = fieldsSchema.safeParse(input);
    if (!parsed.success || !lossless(input)) {
        fail("MALFORMED");
    }
    const seen = new Set<string>();
    for (const field of parsed.data) {
        if (!idValid(field.id)) {
            fail("INVALID_FIELD");
        }
        if (seen.has(field.id)) {
            fail("DUPLICATE_FIELD", field.id);
        }
        seen.add(field.id);
        if (Object.keys(field).some((key) => !base.includes(key) && !kindProperties[field.kind].includes(key))) {
            fail("INVALID_CONFIGURATION", field.id);
        }
        if (field.minLength !== undefined && field.maxLength !== undefined && field.minLength > field.maxLength) {
            fail("INVALID_CONFIGURATION", field.id);
        }
        if (field.kind === "email" && ((field.maxLength ?? 320) > 320 || (field.minLength ?? 0) > 320)) {
            fail("INVALID_CONFIGURATION", field.id);
        }
        if (
            field.min !== undefined &&
            field.max !== undefined &&
            (field.min > field.max || (field.integerOnly && Math.ceil(field.min) > Math.floor(field.max)))
        ) {
            fail("INVALID_CONFIGURATION", field.id);
        }
        if (
            (field.minDate !== undefined && !validDate(field.minDate)) ||
            (field.maxDate !== undefined && !validDate(field.maxDate)) ||
            (field.minDate && field.maxDate && field.minDate > field.maxDate)
        ) {
            fail("INVALID_CONFIGURATION", field.id);
        }
        if (field.kind === "consent" && (!field.statement || (field.required && field.mustBeTrue !== true))) {
            fail("INVALID_CONFIGURATION", field.id);
        }
        if (field.kind === "single-choice" || field.kind === "multiple-choice") {
            if (!field.options?.length) {
                fail("INVALID_CONFIGURATION", field.id);
            }
            const ids = field.options.map((option) => option.id);
            if (ids.some((id) => !idValid(id)) || new Set(ids).size !== ids.length) {
                fail("INVALID_CONFIGURATION", field.id);
            }
            if (
                (field.minSelections ?? 0) > (field.maxSelections ?? ids.length) ||
                (field.maxSelections ?? ids.length) > ids.length
            ) {
                fail("INVALID_CONFIGURATION", field.id);
            }
        }
    }
}
