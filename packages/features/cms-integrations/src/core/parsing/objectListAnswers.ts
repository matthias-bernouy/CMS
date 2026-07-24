import type {
    IntegrationAnswerValue,
    IntegrationObjectListField,
    IntegrationObjectListInput,
} from "../../interfaces/Integration";
import { IntegrationInputError, MissingIntegrationParam } from "../errors";
import { booleanAnswer, isRecord, parseJsonAnswer } from "./definition/values";

export function objectListAnswer(input: IntegrationObjectListInput, raw: unknown): IntegrationAnswerValue[] {
    const name = `answers.${input.name}`;
    const value = parseJsonAnswer(raw, name);
    if (!Array.isArray(value)) {
        throw new IntegrationInputError(name, "must be an array of objects");
    }
    const minimum = input.minItems ?? (input.required ? 1 : 0);
    if (value.length < minimum) {
        throw new IntegrationInputError(name, `must contain at least ${minimum} item${minimum === 1 ? "" : "s"}`);
    }
    if (input.maxItems !== undefined && value.length > input.maxItems) {
        throw new IntegrationInputError(name, `must contain at most ${input.maxItems} items`);
    }
    return value.map((item, index) => objectListItem(input, item, `${name}.${index}`));
}

function objectListItem(
    input: IntegrationObjectListInput,
    value: unknown,
    name: string,
): Record<string, IntegrationAnswerValue> {
    if (!isRecord(value)) {
        throw new IntegrationInputError(name, "must be an object");
    }
    const item: Record<string, IntegrationAnswerValue> = {};
    for (const field of input.fields) {
        const raw = value[field.name];
        if (isMissing(raw)) {
            if (field.required) {
                throw new MissingIntegrationParam(`${name}.${field.name}`);
            }
            if (field.type === "select" && field.multiple) {
                item[field.name] = [];
            }
            continue;
        }
        item[field.name] = fieldAnswer(field, raw, `${name}.${field.name}`);
    }
    return item;
}

function fieldAnswer(field: IntegrationObjectListField, raw: unknown, name: string): IntegrationAnswerValue {
    if (field.type === "boolean") {
        return booleanAnswer(raw, name);
    }
    if (field.type === "select" && field.multiple) {
        return multipleSelectAnswer(field, raw, name);
    }
    if (typeof raw !== "string" || !raw.trim()) {
        throw new IntegrationInputError(name, "must be a non-empty string");
    }
    const value = raw.trim();
    if (field.type === "select" && !field.options.some((option) => option.value === value)) {
        throw new IntegrationInputError(name, "must be one of the declared options");
    }
    return value;
}

function multipleSelectAnswer(
    field: Extract<IntegrationObjectListField, { type: "select" }>,
    raw: unknown,
    name: string,
): string[] {
    if (!Array.isArray(raw)) {
        throw new IntegrationInputError(name, "must be an array");
    }
    const values = raw.map((value, index) => {
        if (typeof value !== "string" || !value.trim()) {
            throw new IntegrationInputError(`${name}.${index}`, "must be a non-empty string");
        }
        const normalized = value.trim();
        if (!field.options.some((option) => option.value === normalized)) {
            throw new IntegrationInputError(`${name}.${index}`, "must be one of the declared options");
        }
        return normalized;
    });
    if (field.required && !values.length) {
        throw new MissingIntegrationParam(name);
    }
    return values;
}

function isMissing(value: unknown): boolean {
    return value === undefined || value === null || value === "";
}
