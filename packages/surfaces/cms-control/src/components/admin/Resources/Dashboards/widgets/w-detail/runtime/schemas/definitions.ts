import { DASHBOARD_MAX_NESTED_FIELDS, DASHBOARD_MAX_OPTIONS } from "@bernouy/cms-dashboards";
import { arrayAt } from "../../../../runtime/expressions";
import type { WDetailSchemaDefinition } from "../../types";

const KEY_MAX_LENGTH = 128;
const LABEL_MAX_LENGTH = 256;
const UNIT_MAX_LENGTH = 32;

export function definitionsAt(data: unknown, path: string | undefined): WDetailSchemaDefinition[] {
    const definitions = new Map<string, WDetailSchemaDefinition>();
    for (const value of arrayAt(data, path).slice(0, DASHBOARD_MAX_NESTED_FIELDS)) {
        const definition = schemaDefinition(value);
        if (definition && !definitions.has(definition.id)) definitions.set(definition.id, definition);
    }
    return [...definitions.values()];
}

function schemaDefinition(value: unknown): WDetailSchemaDefinition | null {
    const row = record(value);
    const nested = record(row?.definition);
    const id = text(row?.id, KEY_MAX_LENGTH) ?? text(row?.fieldKey, KEY_MAX_LENGTH)
        ?? text(row?.key, KEY_MAX_LENGTH);
    const label = text(row?.label, LABEL_MAX_LENGTH) ?? text(nested?.label, LABEL_MAX_LENGTH) ?? id;
    const rawType = text(row?.type, 16) ?? text(row?.fieldType, 16) ?? text(nested?.fieldType, 16);
    const type = rawType === "enum" ? "string" : rawType;
    if (!id || !label || !safeKey(id) || (type !== "string" && type !== "number" && type !== "boolean")) return null;
    const options = schemaOptions(row?.options ?? nested?.options);
    const unit = text(row?.unit, UNIT_MAX_LENGTH) ?? text(nested?.unit, UNIT_MAX_LENGTH);
    return { id, label, type, ...(row?.required === true ? { required: true } : {}),
        ...(unit ? { unit } : {}), ...(options.length ? { options } : {}) };
}

function schemaOptions(value: unknown): Array<{ value: string; label: string }> {
    if (!Array.isArray(value)) return [];
    const seen = new Set<string>();
    return value.slice(0, DASHBOARD_MAX_OPTIONS).flatMap(option => {
        let result: { value: string; label: string } | undefined;
        if (typeof option === "string" || typeof option === "number") {
            const value = text(option, LABEL_MAX_LENGTH);
            if (value) result = { value, label: value };
        } else {
            const entry = record(option);
            const optionValue = text(entry?.value, LABEL_MAX_LENGTH);
            const optionLabel = text(entry?.label, LABEL_MAX_LENGTH) ?? optionValue;
            if (optionValue && optionLabel) result = { value: optionValue, label: optionLabel };
        }
        if (!result || seen.has(result.value)) return [];
        seen.add(result.value);
        return [result];
    });
}

function safeKey(value: string): boolean {
    return /^[A-Za-z_][A-Za-z0-9_-]*$/.test(value) && !["__proto__", "prototype", "constructor"].includes(value);
}
function text(value: unknown, maxLength: number): string | undefined {
    if (typeof value !== "string" && typeof value !== "number") return undefined;
    const result = String(value).trim();
    return result && result.length <= maxLength ? result : undefined;
}
function record(value: unknown): Record<string, unknown> | undefined {
    return value !== null && typeof value === "object" && !Array.isArray(value)
        ? value as Record<string, unknown> : undefined;
}
