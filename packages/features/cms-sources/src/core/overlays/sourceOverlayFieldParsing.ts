import { dataValueAtPath } from "cms-sources/core/validation/parseDataShape";
import {
    SOURCE_OVERLAY_FIELD_TYPES,
    type SourceOverlayDashboardOption,
    type SourceOverlayField,
    type SourceOverlayFieldSourceMap,
    type SourceOverlayFieldType,
} from "cms-sources/interfaces/SourceOverlay";

const SIMPLE_ID = /^[A-Za-z0-9][A-Za-z0-9_-]*$/;
type BoolFieldKey =
    | "required"
    | "nullable"
    | "multiple"
    | "selfEditable"
    | "adminEditable"
    | "showInDashboardTable"
    | "exposeToEditorSources";

export function fieldsFromBody(
    body: unknown,
    path: string,
    map?: SourceOverlayFieldSourceMap,
): SourceOverlayField[] | null {
    const value = dataValueAtPath(body, path);
    if (!Array.isArray(value)) {
        return null;
    }
    const seen = new Set<string>();
    const fields: SourceOverlayField[] = [];
    for (const entry of value) {
        const field = fieldFromEntry(entry, map);
        if (!field || seen.has(field.id)) {
            continue;
        }
        seen.add(field.id);
        fields.push(field);
    }
    return fields;
}

function fieldFromEntry(entry: unknown, map: SourceOverlayFieldSourceMap = {}): SourceOverlayField | null {
    if (!isRecord(entry)) {
        return null;
    }
    const id = text(dataValueAtPath(entry, map.id ?? "id"));
    const type = fieldType(dataValueAtPath(entry, map.type ?? "type"));
    if (!id || !SIMPLE_ID.test(id) || !type) {
        return null;
    }
    return {
        id,
        label: text(dataValueAtPath(entry, map.label ?? "label")) || id,
        type,
        ...optionalText(entry, map.path ?? "path", "path"),
        ...optionalText(entry, map.section ?? "section", "section"),
        ...optionalBool(entry, map.required ?? "required", "required"),
        ...optionalBool(entry, map.nullable ?? "nullable", "nullable"),
        ...optionalBool(entry, map.multiple ?? "multiple", "multiple"),
        ...optionalBool(entry, map.selfEditable ?? "selfEditable", "selfEditable"),
        ...optionalBool(entry, map.adminEditable ?? "adminEditable", "adminEditable"),
        ...optionalBool(entry, map.showInDashboardTable ?? "showInDashboardTable", "showInDashboardTable"),
        ...optionalBool(entry, map.exposeToEditorSources ?? "exposeToEditorSources", "exposeToEditorSources"),
        ...optionalOptions(entry, map.options ?? "options"),
    };
}

function fieldType(value: unknown): SourceOverlayFieldType | null {
    return (SOURCE_OVERLAY_FIELD_TYPES as readonly unknown[]).includes(value)
        ? (value as SourceOverlayFieldType)
        : null;
}

function optionalText(entry: Record<string, unknown>, path: string, key: "path" | "section") {
    const value = text(dataValueAtPath(entry, path));
    return value ? { [key]: value } : {};
}

function optionalBool(entry: Record<string, unknown>, path: string, key: BoolFieldKey): Partial<SourceOverlayField> {
    const value = dataValueAtPath(entry, path);
    return typeof value === "boolean" ? { [key]: value } : {};
}

function optionalOptions(entry: Record<string, unknown>, path: string) {
    const value = dataValueAtPath(entry, path);
    return Array.isArray(value)
        ? { options: value.map(option).filter((item): item is SourceOverlayDashboardOption => item !== null) }
        : {};
}

function option(value: unknown): SourceOverlayDashboardOption | null {
    if (!isRecord(value)) {
        return null;
    }
    const optionValue = text(value.value);
    const label = text(value.label);
    if (!optionValue || !label) {
        return null;
    }
    return {
        value: optionValue,
        label,
        ...optionalOptionText(value.subtitle, "subtitle"),
        ...optionalOptionText(value.media, "media"),
    };
}

function optionalOptionText(value: unknown, key: "subtitle" | "media") {
    const parsed = text(value);
    return parsed ? { [key]: parsed } : {};
}

function text(value: unknown): string {
    return typeof value === "string" ? value.trim() : "";
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return value !== null && typeof value === "object" && !Array.isArray(value);
}
