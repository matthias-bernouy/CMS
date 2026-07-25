import type { DashboardField } from "@bernouy/cms-dashboards";
import type { WDetailReorderableListField, WDetailTableColumn } from "../../widgets/w-detail/types";
import { nestedLookupKey } from "../lookups/targets";
import { optionData, optionList } from "./fieldSupport";
import type { DetailOptions } from "./types";

export function tableColumn(
    fieldId: string,
    column: Extract<DashboardField, { type: "table" }>["columns"][number],
    options: DetailOptions,
): WDetailTableColumn {
    const base = {
        key: column.id,
        label: column.label,
        path: column.path,
        ...(column.width ? { width: column.width } : {}),
        ...(column.format ? { format: column.format } : {}),
    };
    if (column.editable !== true) {
        return base;
    }
    const type = column.type ?? "text";
    if (type === "select") {
        return { ...base, editable: true, type, options: (column.options ?? []).map(optionData) };
    }
    if (type === "combobox") {
        return {
            ...base,
            editable: true,
            type,
            options: optionList(column.options, options[nestedLookupKey(fieldId, column.id)] ?? []),
        };
    }
    return { ...base, editable: true, type };
}

export function reorderableField(
    fieldId: string,
    field: Extract<DashboardField, { type: "reorderable-list" }>["fields"][number],
    options: DetailOptions,
): WDetailReorderableListField {
    const base = {
        id: field.id,
        label: field.label,
        path: field.path,
        ...(field.required ? { required: true } : {}),
        ...(field.placeholder ? { placeholder: field.placeholder } : {}),
    };
    const type = field.type ?? "text";
    if (type === "select") {
        return { ...base, type, options: (field.options ?? []).map(optionData) };
    }
    if (type === "combobox") {
        return { ...base, type, options: optionList(field.options, options[nestedLookupKey(fieldId, field.id)] ?? []) };
    }
    return { ...base, type };
}
