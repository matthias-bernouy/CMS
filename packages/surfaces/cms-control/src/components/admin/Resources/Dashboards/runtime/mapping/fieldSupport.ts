import type { DashboardField, DashboardOption } from "@bernouy/cms-dashboards";
import { valueAt } from "../expressions";
import type { DetailSchemas } from "./types";

export function optionData(option: DashboardOption): { label: string; value: string } {
    return { label: option.label, value: option.value };
}

export function optionList(staticOptions: DashboardOption[] | undefined, dynamicOptions: DashboardOption[]) {
    const seen = new Set<string>();
    return [...(staticOptions ?? []), ...dynamicOptions]
        .filter((option) => {
            if (seen.has(option.value)) {
                return false;
            }
            seen.add(option.value);
            return true;
        })
        .map(optionData);
}

export function textValue(value: unknown): string {
    return value === null || value === undefined ? "" : String(value);
}

export function numberValue(value: unknown): number | "" {
    if (value === null || value === undefined || value === "") {
        return "";
    }
    const parsed = typeof value === "number" ? value : Number(value);
    return Number.isFinite(parsed) ? parsed : "";
}

export function readonlyValue(value: unknown): string | string[] {
    return Array.isArray(value)
        ? value
              .map(textValue)
              .map((item) => item.trim())
              .filter(Boolean)
        : textValue(value);
}

export function tokenValue(value: unknown): string[] {
    return Array.isArray(value) ? value.map(textValue).filter(Boolean) : [];
}

export function tableValue(value: unknown): Record<string, unknown>[] {
    return Array.isArray(value)
        ? value.filter(
              (item): item is Record<string, unknown> =>
                  item !== null && typeof item === "object" && !Array.isArray(item),
          )
        : [];
}

export function recordValue(value: unknown): Record<string, unknown> {
    return value !== null && typeof value === "object" && !Array.isArray(value)
        ? { ...(value as Record<string, unknown>) }
        : {};
}

export function schemaDefinitions(
    field: Extract<DashboardField, { type: "schema" }>,
    fields: Record<string, unknown>,
    definitions: DetailSchemas[string]["definitions"],
): DetailSchemas[string]["definitions"] {
    if (!field.exclude) {
        return definitions;
    }
    const source = valueAt(fields, field.exclude.from.slice("$field.".length));
    const excluded = new Set(
        (Array.isArray(source) ? source : [source]).flatMap((item) => {
            const value = valueAt(item, field.exclude!.valuePath);
            return typeof value === "string" || typeof value === "number" ? [String(value)] : [];
        }),
    );
    return definitions.filter((definition) => !excluded.has(definition.id));
}

export function isCreatable(field: Extract<DashboardField, { type: "combobox" | "tokens" }>): boolean {
    return Boolean(field.allowCustom || field.lookup?.create?.mode === "inline");
}
