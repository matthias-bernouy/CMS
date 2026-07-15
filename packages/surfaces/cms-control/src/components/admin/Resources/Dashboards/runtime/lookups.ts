import {
    isSafeDashboardExpression,
    type DashboardDataRef,
    type DashboardField,
    type DashboardLookupRef,
    type DashboardOption,
    type DashboardWidget,
} from "@bernouy/cms-dashboards";
import { resolveExpression, textAt, valueAt, type RuntimeVars } from "./expressions";
import { fetchSourceJson, itemsFrom } from "./source";
import type { DetailOptions } from "./mapping";

type DetailWidget = Extract<DashboardWidget, { widget: "w-detail" }>;
export type DetailDataLoader = (
    sourceId: string,
    ref: DashboardDataRef,
    vars: RuntimeVars,
) => Promise<unknown>;

type DetailLookupRequestOptions = {
    fieldIds?: ReadonlySet<string>;
    loadData?: DetailDataLoader;
};

export type DetailLookupResult = {
    failedFieldIds: Set<string>;
    options: DetailOptions;
};

export async function detailLookupOptions(
    sourceId: string,
    widget: DetailWidget,
    resource: unknown,
    fields: Record<string, unknown>,
): Promise<DetailOptions> {
    return (await loadDetailLookupOptions(sourceId, widget, resource, fields)).options;
}

export async function loadDetailLookupOptions(
    sourceId: string,
    widget: DetailWidget,
    resource: unknown,
    fields: Record<string, unknown>,
    requestOptions: DetailLookupRequestOptions = {},
): Promise<DetailLookupResult> {
    const loadData = requestOptions.loadData ?? fetchSourceJson;
    const entries = await Promise.all(detailFields(widget)
        .filter(isLookupField)
        .filter(field => !requestOptions.fieldIds || requestOptions.fieldIds.has(field.id))
        .map(field => lookupEntry(sourceId, field, resource, fields, loadData)));
    return {
        failedFieldIds: new Set(entries.filter(entry => entry.failed).map(entry => entry.fieldId)),
        options: Object.fromEntries(entries.map(entry => [entry.fieldId, entry.options])),
    };
}

function detailFields(widget: DetailWidget): DashboardField[] {
    return [...widget.main, ...(widget.aside ?? [])].flatMap(section => section.fields);
}

export function isLookupField(field: DashboardField): field is Extract<DashboardField, { type: "combobox" | "tokens" }> {
    return (field.type === "combobox" || field.type === "tokens") && Boolean(field.lookup);
}

async function lookupEntry(
    sourceId: string,
    field: Extract<DashboardField, { type: "combobox" | "tokens" }>,
    resource: unknown,
    fields: Record<string, unknown>,
    loadData: DetailDataLoader,
): Promise<{ failed: boolean; fieldId: string; options: DashboardOption[] }> {
    const lookup = field.lookup;
    if (!lookup) return { failed: false, fieldId: field.id, options: [] };
    const selected = selectedOptions(field, lookup, resource, fields);
    try {
        const items = await lookupItems(sourceId, lookup, resource, fields, loadData);
        return {
            failed: false,
            fieldId: field.id,
            options: dedupeOptions([...optionsFromItems(items, lookup), ...selected]),
        };
    } catch {
        return { failed: true, fieldId: field.id, options: selected };
    }
}

async function lookupItems(
    sourceId: string,
    lookup: DashboardLookupRef,
    resource: unknown,
    fields: Record<string, unknown>,
    loadData: DetailDataLoader,
): Promise<unknown[]> {
    const vars = { resource, fields };
    if (!lookupDependenciesResolved(lookup, vars)) return [];
    return itemsFrom(await loadData(sourceId, lookup, vars), lookup);
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

function lookupDependenciesResolved(lookup: DashboardLookupRef, vars: RuntimeVars): boolean {
    return Object.values(lookup.params ?? {}).every(expression => {
        if (expression === "$search" || !expression.startsWith("$")) return true;
        const value = resolveExpression(expression, vars);
        return value !== undefined && value !== null && value !== "";
    });
}

function dedupeOptions(options: DashboardOption[]): DashboardOption[] {
    const seen = new Set<string>();
    return options.filter(option => {
        if (seen.has(option.value)) return false;
        seen.add(option.value);
        return true;
    });
}
