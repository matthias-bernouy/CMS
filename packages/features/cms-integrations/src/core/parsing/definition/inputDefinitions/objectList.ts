import { IntegrationInputError, MissingIntegrationParam } from "../../../errors";
import type { IntegrationObjectListField, IntegrationObjectListInput } from "../../../../interfaces/Integration";
import { isRecord, text } from "../values";
import { parseOptionsList } from "./options";

export function parseObjectListInput(
    value: Record<string, unknown>,
    name: string,
    inputName: string,
    label: string,
): IntegrationObjectListInput {
    if (!Array.isArray(value.fields) || !value.fields.length) {
        throw new IntegrationInputError(`${name}.fields`, "object-list inputs must declare at least one field");
    }
    const fields = value.fields.map((field, index) => parseObjectListField(field, `${name}.fields.${index}`));
    assertUniqueFields(fields, `${name}.fields`);
    const minItems = optionalItemCount(value.minItems, `${name}.minItems`);
    const maxItems = optionalItemCount(value.maxItems, `${name}.maxItems`);
    if (minItems !== undefined && maxItems !== undefined && minItems > maxItems) {
        throw new IntegrationInputError(`${name}.minItems`, "cannot exceed maxItems");
    }
    return {
        name: inputName,
        label,
        type: "object-list",
        fields,
        ...(value.required === true ? { required: true } : {}),
        ...(text(value.addLabel) ? { addLabel: text(value.addLabel)! } : {}),
        ...(minItems !== undefined ? { minItems } : {}),
        ...(maxItems !== undefined ? { maxItems } : {}),
    };
}

export function validateObjectListInput(input: IntegrationObjectListInput, name: string): void {
    if (!Array.isArray(input.fields) || !input.fields.length) {
        throw new IntegrationInputError(`${name}.fields`, "object-list inputs must declare at least one field");
    }
    const fields = input.fields.map((field, index) => validateField(field, `${name}.fields.${index}`));
    assertUniqueFields(fields, `${name}.fields`);
    validateItemCount(input.minItems, `${name}.minItems`);
    validateItemCount(input.maxItems, `${name}.maxItems`);
    if (input.minItems !== undefined && input.maxItems !== undefined && input.minItems > input.maxItems) {
        throw new IntegrationInputError(`${name}.minItems`, "cannot exceed maxItems");
    }
}

function parseObjectListField(value: unknown, name: string): IntegrationObjectListField {
    if (!isRecord(value)) {
        throw new IntegrationInputError(name, "must be an object");
    }
    const fieldName = text(value.name);
    const label = text(value.label);
    if (!fieldName) {
        throw new MissingIntegrationParam(`${name}.name`);
    }
    if (!label) {
        throw new MissingIntegrationParam(`${name}.label`);
    }
    const type = text(value.type);
    if (!isObjectListFieldType(type)) {
        throw new IntegrationInputError(`${name}.type`, "must be text, textarea, boolean, select, or page-link");
    }
    if (type !== "select") {
        return { name: fieldName, label, type, ...(value.required === true ? { required: true } : {}) };
    }
    if (!Array.isArray(value.options) || !value.options.length) {
        throw new IntegrationInputError(`${name}.options`, "select fields must declare at least one option");
    }
    return {
        name: fieldName,
        label,
        type,
        options: parseOptionsList(value.options, `${name}.options`),
        ...(value.required === true ? { required: true } : {}),
        ...(value.multiple === true ? { multiple: true } : {}),
    };
}

function validateField(field: IntegrationObjectListField, name: string): IntegrationObjectListField {
    if (!isRecord(field)) {
        throw new IntegrationInputError(name, "must be an object");
    }
    if (!text(field.name) || !text(field.label) || !isObjectListFieldType(text(field.type))) {
        throw new IntegrationInputError(name, "must declare a name, label, and supported type");
    }
    if (field.type === "select") {
        if (!Array.isArray(field.options) || !field.options.length) {
            throw new IntegrationInputError(`${name}.options`, "must not be empty");
        }
        parseOptionsList(field.options, `${name}.options`);
        if (field.multiple !== undefined && typeof field.multiple !== "boolean") {
            throw new IntegrationInputError(`${name}.multiple`, "must be boolean");
        }
    }
    return field;
}

function assertUniqueFields(fields: IntegrationObjectListField[], name: string): void {
    const seen = new Set<string>();
    for (const field of fields) {
        if (seen.has(field.name)) {
            throw new IntegrationInputError(`${name}.${field.name}`, "duplicate field name");
        }
        seen.add(field.name);
    }
}

function optionalItemCount(value: unknown, name: string): number | undefined {
    if (value === undefined) {
        return undefined;
    }
    validateItemCount(value, name);
    return value as number;
}

function validateItemCount(value: unknown, name: string): void {
    if (value !== undefined && (!Number.isInteger(value) || (value as number) < 0)) {
        throw new IntegrationInputError(name, "must be a non-negative integer");
    }
}

function isObjectListFieldType(value: string | undefined): value is IntegrationObjectListField["type"] {
    return (
        value === "text" || value === "textarea" || value === "boolean" || value === "select" || value === "page-link"
    );
}
