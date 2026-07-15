import {
    isSafeDashboardExpression,
    type DashboardField,
    type DashboardLookupRef,
    type DashboardOption,
    type DashboardWidget,
} from "@bernouy/cms-dashboards";
import { resolveExpression, textAt, valueAt } from "./expressions";
import { fetchSourceJson, itemsFrom } from "./source";
import type { DetailOptions } from "./mapping";

type DetailWidget = Extract<DashboardWidget, { widget: "w-detail" }>;

export async function detailLookupOptions(
    sourceId: string,
    widget: DetailWidget,
    resource: unknown,
    fields: Record<string, unknown>,
): Promise<DetailOptions> {
    const entries = await Promise.all(detailFields(widget)
        .filter(isLookupField)
        .map(async field => {
            try {
                return [field.id, await lookupOptions(sourceId, field, resource, fields)] as const;
            } catch {
                return [field.id, []] as const;
            }
        }));
    return Object.fromEntries(entries);
}

function detailFields(widget: DetailWidget): DashboardField[] {
    return [...widget.main, ...(widget.aside ?? [])].flatMap(section => section.fields);
}

function isLookupField(field: DashboardField): field is Extract<DashboardField, { type: "combobox" | "tokens" }> {
    return (field.type === "combobox" || field.type === "tokens") && Boolean(field.lookup);
}

async function lookupOptions(
    sourceId: string,
    field: Extract<DashboardField, { type: "combobox" | "tokens" }>,
    resource: unknown,
    fields: Record<string, unknown>,
): Promise<DashboardOption[]> {
    const lookup = field.lookup;
    if (!lookup) return [];
    const items = await lookupItems(sourceId, lookup, resource, fields);
    const selected = selectedOptions(field, lookup, resource, fields);
    return dedupeOptions([...optionsFromItems(items, lookup), ...selected]);
}

async function lookupItems(
    sourceId: string,
    lookup: DashboardLookupRef,
    resource: unknown,
    fields: Record<string, unknown>,
): Promise<unknown[]> {
    try {
        return itemsFrom(await fetchSourceJson(sourceId, lookup, { resource, fields }), lookup);
    } catch {
        return [];
    }
}

function optionsFromItems(items: unknown[], lookup: DashboardLookupRef): DashboardOption[] {
    return items.flatMap(item => {
        const option = optionFromItem(item, lookup, true);
        return option ? [option] : [];
    });
}

function selectedOptions(
    field: Extract<DashboardField, { type: "combobox" | "tokens" }>,
    lookup: DashboardLookupRef,
    resource: unknown,
    fields: Record<string, unknown>,
): DashboardOption[] {
    const expression: unknown = lookup.selected;
    if (typeof expression !== "string" || !isSafeDashboardExpression(expression, ["resource"], true)) return [];
    const currentValue = Object.hasOwn(fields, field.id) ? fields[field.id] : valueAt(resource, field.path);
    const selected = new Set(selectedValues(currentValue));
    if (!selected.size) return [];
    const resolved = resolveExpression(expression, { resource, fields });
    const items = Array.isArray(resolved) ? resolved : [resolved];
    return dedupeOptions(items.flatMap(item => {
        const option = optionFromItem(item, lookup, false);
        return option && selected.has(option.value) ? [option] : [];
    }));
}

function optionFromItem(item: unknown, lookup: DashboardLookupRef, fallbackToValue: boolean): DashboardOption | null {
    const value = textAt(item, lookup.valuePath);
    const label = textAt(item, lookup.labelPath, fallbackToValue ? value : "");
    if (!value || !label) return null;
    return {
        value,
        label,
        subtitle: lookup.subtitlePath ? textAt(item, lookup.subtitlePath) : undefined,
        media: lookup.mediaPath ? textAt(item, lookup.mediaPath) : undefined,
    };
}

function selectedValues(value: unknown): string[] {
    if (Array.isArray(value)) return value.map(item => String(item)).filter(Boolean);
    if (value === null || value === undefined || value === "") return [];
    return [String(value)];
}

function dedupeOptions(options: DashboardOption[]): DashboardOption[] {
    const seen = new Set<string>();
    return options.filter(option => {
        if (seen.has(option.value)) return false;
        seen.add(option.value);
        return true;
    });
}
