import type { DashboardField, DashboardFieldBase, DashboardReorderableListItemField,
    DashboardTableColumn, DashboardTableDerive } from "@bernouy/cms-dashboards";
import { DASHBOARD_MAX_NESTED_FIELDS } from "@bernouy/cms-dashboards";
import { IntegrationInputError } from "../../../errors";
import { isRecord } from "../../values";
import { optionalBoolean, optionalFiniteNumber, optionalText, requiredText } from "../common";
import { parseColumn } from "./columns";
import { parseEmbeddedLookup, parseOptions } from "./refs";

export function parseTableField(
    base: DashboardFieldBase,
    value: Record<string, unknown>,
    name: string,
): Extract<DashboardField, { type: "table" }> {
    const editable = optionalBoolean(value.editable, `${name}.editable`);
    const addLabel = optionalText(value.addLabel, `${name}.addLabel`);
    if (addLabel && editable !== true) {
        throw new IntegrationInputError(`${name}.addLabel`, "requires an editable table");
    }
    return {
        ...base,
        type: "table",
        columns: parseTableColumns(value.columns, `${name}.columns`, editable === true),
        ...(editable ? { editable } : {}),
        ...(value.derive !== undefined ? { derive: parseTableDerive(value.derive, `${name}.derive`) } : {}),
        ...(addLabel ? { addLabel } : {}),
    };
}

export function parseReorderableListField(
    base: DashboardFieldBase,
    value: Record<string, unknown>,
    name: string,
): Extract<DashboardField, { type: "reorderable-list" }> {
    const fields = parseReorderableFields(value.fields, `${name}.fields`);
    const minItems = parseItemCount(value.minItems, `${name}.minItems`, 0);
    const maxItems = parseItemCount(value.maxItems, `${name}.maxItems`, 1);
    const positionPath = optionalText(value.positionPath, `${name}.positionPath`);
    const addLabel = optionalText(value.addLabel, `${name}.addLabel`);
    if (minItems !== undefined && maxItems !== undefined && minItems > maxItems) {
        throw new IntegrationInputError(`${name}.minItems`, "cannot exceed maxItems");
    }
    return {
        ...base,
        type: "reorderable-list",
        itemKey: requiredText(value.itemKey, `${name}.itemKey`),
        ...(positionPath ? { positionPath } : {}),
        fields,
        ...(addLabel ? { addLabel } : {}),
        ...(minItems !== undefined ? { minItems } : {}),
        ...(maxItems !== undefined ? { maxItems } : {}),
    };
}

function parseTableColumns(value: unknown, name: string, tableEditable: boolean): DashboardTableColumn[] {
    if (!Array.isArray(value) || value.length === 0) {
        throw new IntegrationInputError(name, "must be a non-empty array");
    }
    enforceNestedLimit(value, name);
    const ids = new Set<string>();
    return value.map((entry, index) => {
        const path = `${name}.${index}`;
        if (!isRecord(entry)) throw new IntegrationInputError(path, "must be an object");
        const column = parseColumn(entry, path);
        rejectDuplicateId(column.id, ids, `${path}.id`);
        const editable = optionalBoolean(entry.editable, `${path}.editable`);
        const hasEditor = ["type", "options", "lookup", "value"].some(key => Object.hasOwn(entry, key));
        if ((editable === true || hasEditor) && !tableEditable) {
            throw new IntegrationInputError(path, "cannot configure editing unless the table is editable");
        }
        if (hasEditor && editable !== true) {
            throw new IntegrationInputError(path, "cannot configure an editor unless the column is editable");
        }
        const legacyValue = parseLegacyValue(entry, path);
        if (legacyValue !== undefined && Object.hasOwn(entry, "type")) {
            throw new IntegrationInputError(path, "cannot combine legacy value with type");
        }
        const editor = editable === true && legacyValue === undefined
            ? parseEditor(entry, path, ["text", "select", "combobox", "tokens"])
            : {};
        return {
            ...column,
            ...(editable ? { editable } : {}),
            ...(legacyValue ? { value: legacyValue } : {}),
            ...editor,
        } as DashboardTableColumn;
    });
}

function parseReorderableFields(value: unknown, name: string): DashboardReorderableListItemField[] {
    if (!Array.isArray(value) || value.length === 0) {
        throw new IntegrationInputError(name, "must be a non-empty array");
    }
    enforceNestedLimit(value, name);
    const ids = new Set<string>();
    return value.map((entry, index) => {
        const path = `${name}.${index}`;
        if (!isRecord(entry)) throw new IntegrationInputError(path, "must be an object");
        const id = requiredText(entry.id, `${path}.id`);
        rejectDuplicateId(id, ids, `${path}.id`);
        const required = optionalBoolean(entry.required, `${path}.required`);
        const placeholder = optionalText(entry.placeholder, `${path}.placeholder`);
        return {
            id,
            label: requiredText(entry.label, `${path}.label`),
            path: requiredText(entry.path, `${path}.path`),
            ...(required ? { required } : {}),
            ...(placeholder ? { placeholder } : {}),
            ...parseEditor(entry, path, ["text", "checkbox", "select", "combobox"]),
        } as DashboardReorderableListItemField;
    });
}

function parseEditor(value: Record<string, unknown>, name: string, allowed: readonly string[]): Record<string, unknown> {
    const explicitType = Object.hasOwn(value, "type");
    const type = explicitType ? value.type : "text";
    if (typeof type !== "string" || !allowed.includes(type)) {
        throw new IntegrationInputError(`${name}.type`, `must be ${allowed.join(", ")}`);
    }
    if (Object.hasOwn(value, "allowCustom")) {
        throw new IntegrationInputError(`${name}.allowCustom`, "is not supported for nested editors");
    }
    const hasOptions = Object.hasOwn(value, "options");
    const hasLookup = Object.hasOwn(value, "lookup");
    if (hasOptions && type !== "select" && type !== "combobox") {
        throw new IntegrationInputError(`${name}.options`, `is not supported for ${type} editors`);
    }
    if (hasLookup && type !== "combobox") {
        throw new IntegrationInputError(`${name}.lookup`, "is only supported for combobox editors");
    }
    const options = hasOptions ? parseOptions(value.options, `${name}.options`) : undefined;
    if (options?.length === 0) throw new IntegrationInputError(`${name}.options`, "must not be empty");
    if (type === "select" && !options) throw new IntegrationInputError(`${name}.options`, "is required");
    const lookup = hasLookup ? parseEmbeddedLookup(value.lookup, `${name}.lookup`) : undefined;
    if (type === "combobox" && !options && !lookup) {
        throw new IntegrationInputError(name, "must declare options or lookup");
    }
    return {
        ...(explicitType ? { type } : {}),
        ...(options ? { options } : {}),
        ...(lookup ? { lookup } : {}),
    };
}

function parseLegacyValue(value: Record<string, unknown>, name: string): "text" | "list" | undefined {
    if (!Object.hasOwn(value, "value")) return undefined;
    if (value.value !== "text" && value.value !== "list") {
        throw new IntegrationInputError(`${name}.value`, "must be text or list");
    }
    return value.value;
}

function parseTableDerive(value: unknown, name: string): DashboardTableDerive {
    if (!isRecord(value)) throw new IntegrationInputError(name, "must be an object");
    if (value.type !== "cartesian") throw new IntegrationInputError(`${name}.type`, "must be cartesian");
    return { type: "cartesian", sourceField: requiredText(value.sourceField, `${name}.sourceField`),
        labelPath: requiredText(value.labelPath, `${name}.labelPath`), valuesPath: requiredText(value.valuesPath, `${name}.valuesPath`) };
}

function parseItemCount(value: unknown, name: string, minimum: number): number | undefined {
    const parsed = optionalFiniteNumber(value, name);
    if (parsed !== undefined && (!Number.isInteger(parsed) || parsed < minimum)) {
        throw new IntegrationInputError(name, `must be an integer greater than or equal to ${minimum}`);
    }
    return parsed;
}

function enforceNestedLimit(value: unknown[], name: string): void {
    if (value.length > DASHBOARD_MAX_NESTED_FIELDS) {
        throw new IntegrationInputError(name, `must contain at most ${DASHBOARD_MAX_NESTED_FIELDS} entries`);
    }
}

function rejectDuplicateId(id: string, ids: Set<string>, name: string): void {
    if (ids.has(id)) throw new IntegrationInputError(name, "is duplicated");
    ids.add(id);
}
