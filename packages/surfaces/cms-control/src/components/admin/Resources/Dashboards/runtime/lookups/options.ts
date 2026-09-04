import {
    isSafeDashboardExpression,
    type DashboardDataRef,
    type DashboardEmbeddedLookupRef,
    type DashboardOption,
    type DashboardWidget,
} from "@bernouy/cms-dashboards";
import { resolveExpression, textAt, valueAt, type RuntimeVars } from "../expressions";
import type { DetailOptions } from "../mapping";
import { fetchSourceJson, itemsFrom } from "../source";
import { detailLookupTargets, type DetailLookupTarget } from "./targets";

type DetailWidget = Extract<DashboardWidget, { widget: "w-detail" }>;
export type DetailDataLoader = (sourceId: string, ref: DashboardDataRef, vars: RuntimeVars) => Promise<unknown>;
type DetailLookupRequestOptions = {
    targetKeys?: ReadonlySet<string>;
    loadData?: DetailDataLoader;
    vars?: Pick<RuntimeVars, "search" | "limit" | "offset">;
};
export type DetailLookupPage = { received: number; total?: number };
export type DetailLookupResult = {
    failedTargetKeys: Set<string>;
    options: DetailOptions;
    pages: Record<string, DetailLookupPage>;
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
    const entries = await Promise.all(
        detailLookupTargets(widget)
            .filter((target) => !requestOptions.targetKeys || requestOptions.targetKeys.has(target.key))
            .map((target) => lookupEntry(sourceId, target, resource, fields, loadData, requestOptions.vars)),
    );
    return {
        failedTargetKeys: new Set(entries.filter((entry) => entry.failed).map((entry) => entry.key)),
        options: Object.fromEntries(entries.map((entry) => [entry.key, entry.options])),
        pages: Object.fromEntries(entries.map((entry) => [entry.key, entry.page])),
    };
}

async function lookupEntry(
    sourceId: string,
    target: DetailLookupTarget,
    resource: unknown,
    fields: Record<string, unknown>,
    loadData: DetailDataLoader,
    requestVars: DetailLookupRequestOptions["vars"],
): Promise<{ failed: boolean; key: string; options: DashboardOption[]; page: DetailLookupPage }> {
    const selected = selectedOptions(target, resource, fields);
    try {
        const { items, total } = await lookupItems(sourceId, target.lookup, resource, fields, loadData, requestVars);
        return {
            failed: false,
            key: target.key,
            options: dedupeOptions([...optionsFromItems(items, target.lookup), ...selected]),
            page: { received: items.length, ...(total !== undefined ? { total } : {}) },
        };
    } catch {
        return { failed: true, key: target.key, options: selected, page: { received: 0 } };
    }
}

async function lookupItems(
    sourceId: string,
    lookup: DashboardEmbeddedLookupRef,
    resource: unknown,
    fields: Record<string, unknown>,
    loadData: DetailDataLoader,
    requestVars: DetailLookupRequestOptions["vars"],
): Promise<{ items: unknown[]; total?: number }> {
    const vars = { resource, fields, ...requestVars };
    if (!lookupDependenciesResolved(lookup, vars)) {
        return { items: [] };
    }
    const payload = await loadData(sourceId, lookup, vars);
    const total = numericTotal(payload, lookup.totalPath);
    return { items: itemsFrom(payload, lookup), ...(total !== undefined ? { total } : {}) };
}

function optionsFromItems(items: unknown[], lookup: DashboardEmbeddedLookupRef): DashboardOption[] {
    return items.flatMap((item) => {
        const option = optionFromItem(item, lookup, true);
        return option ? [option] : [];
    });
}

function selectedOptions(
    target: DetailLookupTarget,
    resource: unknown,
    fields: Record<string, unknown>,
): DashboardOption[] {
    const field = target.selectedField;
    const expression: unknown = target.lookup.selected;
    if (!field || typeof expression !== "string" || !isSafeDashboardExpression(expression, ["resource"], true)) {
        return [];
    }
    const current = Object.hasOwn(fields, field.id) ? fields[field.id] : valueAt(resource, field.path);
    const selected = new Set(selectedValues(current));
    if (!selected.size) {
        return [];
    }
    const resolved = resolveExpression(expression, { resource, fields });
    const items = Array.isArray(resolved) ? resolved : [resolved];
    return dedupeOptions(
        items.flatMap((item) => {
            const option = optionFromItem(item, target.lookup, false);
            return option && selected.has(option.value) ? [option] : [];
        }),
    );
}

function optionFromItem(
    item: unknown,
    lookup: DashboardEmbeddedLookupRef,
    fallbackToValue: boolean,
): DashboardOption | null {
    const value = textAt(item, lookup.valuePath);
    const label = textAt(item, lookup.labelPath, fallbackToValue ? value : "");
    if (!value || !label) {
        return null;
    }
    return {
        value,
        label,
        subtitle: lookup.subtitlePath ? textAt(item, lookup.subtitlePath) : undefined,
        media: lookup.mediaPath ? textAt(item, lookup.mediaPath) : undefined,
    };
}

function selectedValues(value: unknown): string[] {
    if (Array.isArray(value)) {
        return value.map(String).filter(Boolean);
    }
    return value === null || value === undefined || value === "" ? [] : [String(value)];
}

function lookupDependenciesResolved(lookup: DashboardEmbeddedLookupRef, vars: RuntimeVars): boolean {
    return Object.values(lookup.params ?? {}).every((expression) => {
        if (["$search", "$limit", "$offset"].includes(expression) || !expression.startsWith("$")) {
            return true;
        }
        const value = resolveExpression(expression, vars);
        return value !== undefined && value !== null && value !== "";
    });
}

function numericTotal(payload: unknown, path: string | undefined): number | undefined {
    const value = path ? valueAt(payload, path) : undefined;
    const total = typeof value === "number" ? value : Number(value);
    return Number.isFinite(total) && total >= 0 ? total : undefined;
}

function dedupeOptions(options: DashboardOption[]): DashboardOption[] {
    const seen = new Set<string>();
    return options.filter((option) => {
        if (seen.has(option.value)) {
            return false;
        }
        seen.add(option.value);
        return true;
    });
}
