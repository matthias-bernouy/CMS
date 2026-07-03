import type { DashboardDataRef, DashboardField, DashboardOption, DashboardWidget } from "@bernouy/cms-dashboards";
import { arrayAt, textAt } from "./expressions";
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
        .map(async field => [field.id, await lookupOptions(sourceId, field, resource, fields)] as const));
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
    const data = await fetchSourceJson(sourceId, lookup, { resource, fields });
    const items = itemsFrom(data, lookup);
    const selected = [...selectedItems(field, resource, fields), ...await selectedLookupItems(sourceId, field, resource, fields)];
    return dedupeOptions([...items, ...selected].map(item => ({
        value: textAt(item, lookup.valuePath),
        label: textAt(item, lookup.labelPath, textAt(item, lookup.valuePath)),
        subtitle: lookup.subtitlePath ? textAt(item, lookup.subtitlePath) : undefined,
        media: lookup.mediaPath ? textAt(item, lookup.mediaPath) : undefined,
    })).filter(option => option.value && option.label));
}

function selectedItems(field: Extract<DashboardField, { type: "combobox" | "tokens" }>, resource: unknown, fields: Record<string, unknown>): unknown[] {
    const value = fields[field.id];
    if (Array.isArray(value)) return value;
    const pathValue = arrayAt(resource, field.path);
    return pathValue.length ? pathValue : [];
}

async function selectedLookupItems(
    sourceId: string,
    field: Extract<DashboardField, { type: "combobox" | "tokens" }>,
    resource: unknown,
    fields: Record<string, unknown>,
): Promise<unknown[]> {
    const lookup = field.lookup;
    if (!lookup?.selected) return [];
    const values = selectedValues(fields[field.id]);
    const items = await Promise.all(values.map(async value => itemFromSelectedLookup(sourceId, lookup.selected!, resource, fields, value)));
    return items.filter((item): item is unknown => item !== undefined && item !== null);
}

async function itemFromSelectedLookup(sourceId: string, selected: DashboardDataRef, resource: unknown, fields: Record<string, unknown>, value: string): Promise<unknown> {
    try {
        return await fetchSourceJson(sourceId, selected, { resource, fields, value });
    } catch {
        return null;
    }
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
