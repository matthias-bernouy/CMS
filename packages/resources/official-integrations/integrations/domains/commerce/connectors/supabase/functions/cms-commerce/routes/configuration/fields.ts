import { HttpError } from "../../core/errors.ts";
import { booleanValue, integer, text } from "../../core/records.ts";
import type { JsonRecord } from "../../core/types.ts";

export function dynamicField(row: JsonRecord): JsonRecord {
    const rawOptions = Array.isArray(row.options) ? row.options : [];
    return {
        id: String(row.key),
        label: String(row.label),
        type: row.field_type === "enum" ? "string" : row.field_type,
        path: `metadata.${String(row.key)}`,
        section: `${String(row.entity_type)}CustomFields`,
        required: row.required === true,
        selfEditable: row.self_editable === true,
        adminEditable: row.admin_editable !== false,
        showInDashboardTable: row.show_in_dashboard_table === true,
        exposeToEditorSources: row.public_readable === true,
        ...(row.field_type === "enum"
            ? { options: rawOptions.map((value) => ({ value: String(value), label: String(value) })) }
            : {}),
    };
}

export function normalizeOptions(value: unknown): string[] {
    if (value === undefined || value === null || value === "") {
        return [];
    }
    const values = Array.isArray(value) ? value : typeof value === "string" ? value.split(",") : null;
    if (!values) {
        throw new HttpError(422, "options must be an array or comma-separated text");
    }
    return [...new Set(values.map((entry) => String(entry).trim()).filter(Boolean))].slice(0, 64);
}

export function setText(target: JsonRecord, key: string, value: unknown, lowercase = false): void {
    const result = text(value);
    if (result !== undefined) {
        target[key] = lowercase ? result.toLowerCase() : result;
    }
}

export function setBoolean(target: JsonRecord, key: string, value: unknown): void {
    const result = booleanValue(value, key);
    if (result !== undefined) {
        target[key] = result;
    }
}

export function setInteger(target: JsonRecord, key: string, value: unknown): void {
    const result = integer(value, key);
    if (result !== undefined) {
        target[key] = result;
    }
}
