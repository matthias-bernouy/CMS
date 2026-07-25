import {
    isSafeDashboardPath,
    type DashboardField,
    type DashboardFieldBase,
    type DashboardSection,
} from "@bernouy/cms-dashboards";
import { IntegrationInputError } from "../../../../errors";
import { isRecord, text } from "../../../definition/values";
import { optionalBoolean, optionalFiniteNumber, optionalText, requiredText } from "../../common";
import { parseReorderableListField, parseTableField } from "./complexFields";
import { parseMediaField, parseReadonlyFormat } from "./mediaFields";
import { parseSchemaField } from "./schemaField";
import { parseLookup, parseOptions } from "../refs";
import { parseVisibilityRule } from "../visibility";

export function parseSections(value: unknown, name: string): DashboardSection[] {
    if (!Array.isArray(value)) {
        throw new IntegrationInputError(name, "must be an array");
    }
    return value.map((entry, index) => parseSection(entry, `${name}.${index}`));
}

export function parseFields(value: unknown, name: string): DashboardField[] {
    if (!Array.isArray(value)) {
        throw new IntegrationInputError(name, "must be an array");
    }
    const fields = value.map((entry, index) => parseField(entry, `${name}.${index}`));
    const ids = new Set<string>();
    for (const [index, field] of fields.entries()) {
        if (ids.has(field.id)) {
            throw new IntegrationInputError(`${name}.${index}.id`, "is duplicated");
        }
        ids.add(field.id);
    }
    return fields;
}

function parseSection(value: unknown, name: string): DashboardSection {
    if (!isRecord(value)) {
        throw new IntegrationInputError(name, "must be an object");
    }
    return {
        id: requiredText(value.id, `${name}.id`),
        title: requiredText(value.title, `${name}.title`),
        ...(text(value.description) ? { description: text(value.description)! } : {}),
        fields: parseFields(value.fields, `${name}.fields`),
    };
}

function parseField(value: unknown, name: string): DashboardField {
    if (!isRecord(value)) {
        throw new IntegrationInputError(name, "must be an object");
    }
    const required = optionalBoolean(value.required, `${name}.required`);
    const base: DashboardFieldBase = {
        id: requiredText(value.id, `${name}.id`),
        label: requiredText(value.label, `${name}.label`),
        path: requiredText(value.path, `${name}.path`),
        ...(value.visibleWhen !== undefined
            ? { visibleWhen: parseVisibilityRule(value.visibleWhen, `${name}.visibleWhen`) }
            : {}),
        ...(required ? { required } : {}),
    };
    const type = requiredText(value.type, `${name}.type`);
    if (type === "text" || type === "cms-user") {
        return { ...base, type, ...placeholder(value, name) };
    }
    if (type === "number") {
        return parseNumberField(base, value, name);
    }
    if (type === "money") {
        return parseMoneyField(base, value, name);
    }
    if (type === "checkbox") {
        return { ...base, type };
    }
    if (type === "textarea") {
        const rows = optionalFiniteNumber(value.rows, `${name}.rows`);
        if (rows !== undefined && (!Number.isInteger(rows) || rows < 1)) {
            throw new IntegrationInputError(`${name}.rows`, "must be a positive integer");
        }
        return { ...base, type, ...(rows !== undefined ? { rows } : {}) };
    }
    if (type === "select") {
        return { ...base, type, options: parseOptions(value.options, `${name}.options`) };
    }
    if (type === "combobox" || type === "tokens") {
        const allowCustom = optionalBoolean(value.allowCustom, `${name}.allowCustom`);
        return {
            ...base,
            type,
            ...(value.options !== undefined ? { options: parseOptions(value.options, `${name}.options`) } : {}),
            ...(value.lookup !== undefined ? { lookup: parseLookup(value.lookup, `${name}.lookup`) } : {}),
            ...(allowCustom ? { allowCustom } : {}),
        };
    }
    if (type === "table") {
        return parseTableField(base, value, name);
    }
    if (type === "reorderable-list") {
        return parseReorderableListField(base, value, name);
    }
    if (type === "schema") {
        return parseSchemaField(base, value, name);
    }
    if (type === "media") {
        return parseMediaField(base, value, name);
    }
    if (type === "readonly") {
        const format = parseReadonlyFormat(value.format, `${name}.format`);
        return { ...base, type, ...(format ? { format } : {}) };
    }
    throw new IntegrationInputError(`${name}.type`, "is not a supported dashboard field type");
}

function parseMoneyField(
    base: DashboardFieldBase,
    value: Record<string, unknown>,
    name: string,
): Extract<DashboardField, { type: "money" }> {
    const currencyPath = optionalText(value.currencyPath, `${name}.currencyPath`);
    if (currencyPath && !isSafeDashboardPath(currencyPath)) {
        throw new IntegrationInputError(`${name}.currencyPath`, "must be a safe dotted data path");
    }
    const allowDecimals =
        typeof value.allowDecimals === "boolean"
            ? value.allowDecimals
            : value.allowDecimals === undefined
              ? undefined
              : parseVisibilityRule(value.allowDecimals, `${name}.allowDecimals`);
    return {
        ...base,
        type: "money",
        ...placeholder(value, name),
        ...(currencyPath ? { currencyPath } : {}),
        ...(allowDecimals !== undefined ? { allowDecimals } : {}),
    };
}

function parseNumberField(
    base: DashboardFieldBase,
    value: Record<string, unknown>,
    name: string,
): Extract<DashboardField, { type: "number" }> {
    const min = optionalFiniteNumber(value.min, `${name}.min`);
    const max = optionalFiniteNumber(value.max, `${name}.max`);
    const step = optionalFiniteNumber(value.step, `${name}.step`);
    if (step !== undefined && step <= 0) {
        throw new IntegrationInputError(`${name}.step`, "must be greater than zero");
    }
    if (min !== undefined && max !== undefined && max < min) {
        throw new IntegrationInputError(`${name}.max`, "must be greater than or equal to min");
    }
    return {
        ...base,
        type: "number",
        ...placeholder(value, name),
        ...(min !== undefined ? { min } : {}),
        ...(max !== undefined ? { max } : {}),
        ...(step !== undefined ? { step } : {}),
    };
}

function placeholder(value: Record<string, unknown>, name: string): { placeholder?: string } {
    const parsed = optionalText(value.placeholder, `${name}.placeholder`);
    return parsed ? { placeholder: parsed } : {};
}
