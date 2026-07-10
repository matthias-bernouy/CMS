import type {
    DashboardField,
    DashboardReorderableListItemField,
    DashboardSection,
    DashboardTableColumn,
    DashboardTableDerive,
} from "@bernouy/cms-dashboards";
import { IntegrationInputError } from "../../../errors";
import { isRecord, text } from "../../values";
import { requiredText } from "../common";
import { parseActions } from "./actions";
import { parseColumn } from "./columns";
import { parseEndpointRef, parseLookup, parseOptions } from "./refs";

export function parseSections(value: unknown, name: string): DashboardSection[] {
    if (!Array.isArray(value)) throw new IntegrationInputError(name, "must be an array");
    return value.map((entry, index) => parseSection(entry, `${name}.${index}`));
}

export function parseFields(value: unknown, name: string): DashboardField[] {
    if (!Array.isArray(value)) throw new IntegrationInputError(name, "must be an array");
    return value.map((entry, index) => parseField(entry, `${name}.${index}`));
}

function parseSection(value: unknown, name: string): DashboardSection {
    if (!isRecord(value)) throw new IntegrationInputError(name, "must be an object");
    return {
        id: requiredText(value.id, `${name}.id`),
        title: requiredText(value.title, `${name}.title`),
        ...(text(value.description) ? { description: text(value.description)! } : {}),
        fields: parseFields(value.fields, `${name}.fields`),
    };
}

function parseField(value: unknown, name: string): DashboardField {
    if (!isRecord(value)) throw new IntegrationInputError(name, "must be an object");
    const base = {
        id: requiredText(value.id, `${name}.id`),
        label: requiredText(value.label, `${name}.label`),
        path: requiredText(value.path, `${name}.path`),
        ...(value.visibleWhen !== undefined ? { visibleWhen: parseFieldVisibility(value.visibleWhen, `${name}.visibleWhen`) } : {}),
        ...(value.required === true ? { required: true } : {}),
    };
    const type = requiredText(value.type, `${name}.type`);
    if (type === "text") return { ...base, type, ...(text(value.placeholder) ? { placeholder: text(value.placeholder)! } : {}) };
    if (type === "textarea") return { ...base, type, ...(typeof value.rows === "number" ? { rows: value.rows } : {}) };
    if (type === "select") return { ...base, type, options: parseOptions(value.options, `${name}.options`) };
    if (type === "combobox" || type === "tokens") return {
        ...base,
        type,
        ...(value.options !== undefined ? { options: parseOptions(value.options, `${name}.options`) } : {}),
        ...(value.lookup !== undefined ? { lookup: parseLookup(value.lookup, `${name}.lookup`) } : {}),
        ...(value.allowCustom === true ? { allowCustom: true } : {}),
    };
    if (type === "table") return {
        ...base,
        type,
        columns: parseTableColumns(value.columns, `${name}.columns`),
        ...(value.editable === true ? { editable: true } : {}),
        ...(value.derive !== undefined ? { derive: parseTableDerive(value.derive, `${name}.derive`) } : {}),
    };
    if (type === "reorderable-list") return {
        ...base,
        type,
        itemKey: requiredText(value.itemKey, `${name}.itemKey`),
        ...(text(value.positionPath) ? { positionPath: text(value.positionPath)! } : {}),
        fields: parseReorderableListFields(value.fields, `${name}.fields`),
        ...(text(value.addLabel) ? { addLabel: text(value.addLabel)! } : {}),
        ...(typeof value.minItems === "number" ? { minItems: value.minItems } : {}),
        ...(typeof value.maxItems === "number" ? { maxItems: value.maxItems } : {}),
    };
    if (type === "media") return {
        ...base,
        type,
        ...(value.multiple === true ? { multiple: true } : {}),
        item: parseMediaItem(value.item, `${name}.item`),
        ...(value.actions !== undefined ? { actions: parseMediaActions(value.actions, `${name}.actions`) } : {}),
    };
    if (type === "readonly") return {
        ...base,
        type,
        ...(parseReadonlyFormat(value.format, `${name}.format`) ? { format: parseReadonlyFormat(value.format, `${name}.format`)! } : {}),
    };
    throw new IntegrationInputError(`${name}.type`, "must be text, textarea, select, combobox, tokens, table, reorderable-list, media, or readonly");
}

function parseReorderableListFields(value: unknown, name: string): DashboardReorderableListItemField[] {
    if (!Array.isArray(value)) throw new IntegrationInputError(name, "must be an array");
    return value.map((entry, index) => {
        if (!isRecord(entry)) throw new IntegrationInputError(`${name}.${index}`, "must be an object");
        return {
            id: requiredText(entry.id, `${name}.${index}.id`),
            label: requiredText(entry.label, `${name}.${index}.label`),
            path: requiredText(entry.path, `${name}.${index}.path`),
            ...(entry.required === true ? { required: true } : {}),
            ...(text(entry.placeholder) ? { placeholder: text(entry.placeholder)! } : {}),
        };
    });
}

function parseTableColumns(value: unknown, name: string): DashboardTableColumn[] {
    if (!Array.isArray(value)) throw new IntegrationInputError(name, "must be an array");
    return value.map((entry, index) => {
        const column = parseColumn(entry, `${name}.${index}`) as DashboardTableColumn;
        if (!isRecord(entry)) return column;
        if (entry.editable === true) column.editable = true;
        if (entry.value !== undefined) {
            if (entry.value !== "text" && entry.value !== "list") throw new IntegrationInputError(`${name}.${index}.value`, "must be text or list");
            column.value = entry.value;
        }
        return column;
    });
}

function parseTableDerive(value: unknown, name: string): DashboardTableDerive {
    if (!isRecord(value)) throw new IntegrationInputError(name, "must be an object");
    const type = requiredText(value.type, `${name}.type`);
    if (type !== "cartesian") throw new IntegrationInputError(`${name}.type`, "must be cartesian");
    return {
        type,
        sourceField: requiredText(value.sourceField, `${name}.sourceField`),
        labelPath: requiredText(value.labelPath, `${name}.labelPath`),
        valuesPath: requiredText(value.valuesPath, `${name}.valuesPath`),
    };
}

function parseFieldVisibility(value: unknown, name: string): NonNullable<DashboardField["visibleWhen"]> {
    if (!isRecord(value)) throw new IntegrationInputError(name, "must be an object");
    const rule: NonNullable<DashboardField["visibleWhen"]> = { field: requiredText(value.field, `${name}.field`) };
    if (value.equals !== undefined) rule.equals = parseVisibilityValue(value.equals, `${name}.equals`);
    if (value.notEquals !== undefined) rule.notEquals = parseVisibilityValue(value.notEquals, `${name}.notEquals`);
    if (rule.equals === undefined && rule.notEquals === undefined) throw new IntegrationInputError(name, "must declare equals or notEquals");
    return rule;
}

function parseVisibilityValue(value: unknown, name: string): string | number | boolean | null {
    if (value === null || typeof value === "string" || typeof value === "number" || typeof value === "boolean") return value;
    throw new IntegrationInputError(name, "must be a string, number, boolean, or null");
}

function parseMediaItem(value: unknown, name: string): Extract<DashboardField, { type: "media" }>["item"] {
    if (!isRecord(value)) throw new IntegrationInputError(name, "must be an object");
    return {
        ...(text(value.idPath) ? { idPath: text(value.idPath)! } : {}),
        urlPath: requiredText(value.urlPath, `${name}.urlPath`),
        ...(text(value.altPath) ? { altPath: text(value.altPath)! } : {}),
    };
}

function parseMediaActions(value: unknown, name: string): Extract<DashboardField, { type: "media" }>["actions"] {
    if (!isRecord(value)) throw new IntegrationInputError(name, "must be an object");
    const actions: Extract<DashboardField, { type: "media" }>["actions"] = {};
    for (const action of ["upload", "replace", "remove", "reorder"] as const) {
        if (value[action] !== undefined) {
            if (!isRecord(value[action])) throw new IntegrationInputError(`${name}.${action}`, "must be an object");
            actions[action] = parseEndpointRef(value[action], `${name}.${action}`);
        }
    }
    return actions;
}

function parseReadonlyFormat(value: unknown, name: string): Extract<DashboardField, { type: "readonly" }>["format"] | undefined {
    if (value === undefined) return undefined;
    if (value === "date" || value === "money" || value === "badge" || value === "text" || value === "image" || value === "url") return value;
    throw new IntegrationInputError(name, "must be date, money, badge, text, image, or url");
}
