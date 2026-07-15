import type { DashboardField, DashboardOption } from "@bernouy/cms-dashboards";
import type {
    WDetailField,
    WDetailReorderableListField,
    WDetailTableColumn,
} from "../../widgets/w-detail/types";
import { valueAt } from "../expressions";
import { mediaValue } from "../media";
import { nestedLookupKey } from "../lookups/targets";
import type { DetailOptions } from "./types";

export function detailField(
    field: DashboardField,
    resource: unknown,
    fields: Record<string, unknown>,
    options: DetailOptions,
    sourceId: string,
): WDetailField {
    const value = Object.hasOwn(fields, field.id) ? fields[field.id] : valueAt(resource, field.path);
    const base = {
        id: field.id,
        label: field.label,
        ...(field.required ? { required: true } : {}),
        ...("placeholder" in field && field.placeholder ? { placeholder: field.placeholder } : {}),
    };
    if (field.type === "number") return { ...base, input: "number", value: numberValue(value),
        ...(field.min !== undefined ? { min: field.min } : {}),
        ...(field.max !== undefined ? { max: field.max } : {}),
        ...(field.step !== undefined ? { step: field.step } : {}) };
    if (field.type === "checkbox") return { ...base, input: "checkbox", value: value === true };
    if (field.type === "textarea") return { ...base, input: "textarea", value: textValue(value),
        ...(field.rows !== undefined ? { rows: field.rows } : {}) };
    if (field.type === "select") return { ...base, input: "select", value: textValue(value),
        options: field.options.map(optionData) };
    if (field.type === "combobox") return { ...base, input: "combobox", value: textValue(value),
        options: optionList(field.options, options[field.id] ?? []), creatable: isCreatable(field) };
    if (field.type === "tokens") return { ...base, input: "tokens", value: tokenValue(value),
        options: optionList(field.options, options[field.id] ?? []), creatable: isCreatable(field) };
    if (field.type === "table") return { ...base, input: "table", value: tableValue(value),
        columns: field.columns.map(column => tableColumn(field.id, column, options)),
        ...(field.derive ? { derive: field.derive } : {}),
        ...(field.editable === true ? { editable: true } : {}),
        ...(field.addLabel ? { addLabel: field.addLabel } : {}) };
    if (field.type === "reorderable-list") return { ...base, input: "reorderable-list", value: tableValue(value),
        itemKey: field.itemKey,
        ...(field.positionPath ? { positionPath: field.positionPath } : {}),
        reorderableFields: field.fields.map(item => reorderableField(field.id, item, options)),
        ...(field.addLabel ? { addLabel: field.addLabel } : {}),
        ...(field.minItems !== undefined ? { minItems: field.minItems } : {}),
        ...(field.maxItems !== undefined ? { maxItems: field.maxItems } : {}) };
    if (field.type === "media") return { ...base, input: "media-list", value: mediaValue(value, field, sourceId), accept: "image/*" };
    if (field.type === "readonly") return { ...base, input: field.format === "badge" ? "badge" : "readonly", value: readonlyValue(value) };
    return { ...base, input: "text", value: textValue(value) };
}

function tableColumn(
    fieldId: string,
    column: Extract<DashboardField, { type: "table" }>["columns"][number],
    options: DetailOptions,
): WDetailTableColumn {
    const base = { key: column.id, label: column.label, path: column.path,
        ...(column.width ? { width: column.width } : {}) };
    if (column.editable !== true) return base;
    const type = column.type ?? "text";
    if (type === "select") return { ...base, editable: true, type, options: (column.options ?? []).map(optionData) };
    if (type === "combobox") return { ...base, editable: true, type,
        options: optionList(column.options, options[nestedLookupKey(fieldId, column.id)] ?? []) };
    return { ...base, editable: true, type };
}

function reorderableField(
    fieldId: string,
    field: Extract<DashboardField, { type: "reorderable-list" }>["fields"][number],
    options: DetailOptions,
): WDetailReorderableListField {
    const base = { id: field.id, label: field.label, path: field.path,
        ...(field.required ? { required: true } : {}), ...(field.placeholder ? { placeholder: field.placeholder } : {}) };
    const type = field.type ?? "text";
    if (type === "select") return { ...base, type, options: (field.options ?? []).map(optionData) };
    if (type === "combobox") return { ...base, type,
        options: optionList(field.options, options[nestedLookupKey(fieldId, field.id)] ?? []) };
    return { ...base, type };
}

function optionData(option: DashboardOption): { label: string; value: string } {
    return { label: option.label, value: option.value };
}

function optionList(staticOptions: DashboardOption[] | undefined, dynamicOptions: DashboardOption[]) {
    const seen = new Set<string>();
    return [...(staticOptions ?? []), ...dynamicOptions].filter(option => {
        if (seen.has(option.value)) return false;
        seen.add(option.value);
        return true;
    }).map(optionData);
}

function textValue(value: unknown): string { return value === null || value === undefined ? "" : String(value); }
function numberValue(value: unknown): number | "" {
    if (value === null || value === undefined || value === "") return "";
    const parsed = typeof value === "number" ? value : Number(value);
    return Number.isFinite(parsed) ? parsed : "";
}
function readonlyValue(value: unknown): string | string[] {
    return Array.isArray(value) ? value.map(textValue).map(item => item.trim()).filter(Boolean) : textValue(value);
}
function tokenValue(value: unknown): string[] { return Array.isArray(value) ? value.map(textValue).filter(Boolean) : []; }
function tableValue(value: unknown): Record<string, unknown>[] {
    return Array.isArray(value) ? value.filter((item): item is Record<string, unknown> => (
        item !== null && typeof item === "object" && !Array.isArray(item)
    )) : [];
}
function isCreatable(field: Extract<DashboardField, { type: "combobox" | "tokens" }>): boolean {
    return Boolean(field.allowCustom || field.lookup?.create?.mode === "inline");
}
