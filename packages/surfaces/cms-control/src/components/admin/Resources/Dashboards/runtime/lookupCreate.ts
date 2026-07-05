import type { DashboardDto, DashboardField, DashboardOption, DashboardWidget } from "@bernouy/cms-dashboards";
import type { DashboardSourceGroup } from "../types";
import type { DetailSelection } from "../domain";
import { valueAt } from "./expressions";
import { fetchSourceJson, itemFrom, sendSourceJson } from "./source";
import { fieldValues } from "./mapping";

type DetailWidget = Extract<DashboardWidget, { widget: "w-detail" }>;
type LookupField = Extract<DashboardField, { type: "combobox" | "tokens" }>;
export type LookupCreateResult = {
    value: unknown;
    option: DashboardOption;
};

export async function executeLookupCreate(
    group: DashboardSourceGroup,
    dashboard: DashboardDto,
    detail: DetailSelection,
    fieldId: string,
    previousDraft: Record<string, unknown>,
    nextDraft: Record<string, unknown>,
): Promise<LookupCreateResult | undefined> {
    const widget = findDetailWidget(dashboard.views, detail.collection);
    const field = widget ? lookupField(widget, fieldId) : null;
    const create = field?.lookup?.create;
    if (!widget || !field || !create || create.mode !== "inline") return undefined;

    const data = await fetchSourceJson(dashboard.source, widget.source, { selection: { id: detail.row } });
    const resource = itemFrom(data, widget.source);
    const baseFields = fieldValues(widget, resource);
    const previousValue = (previousDraft[fieldId] ?? baseFields[fieldId]) as unknown;
    const nextValue = nextDraft[fieldId];
    const createdValue = createdInput(previousValue, nextValue);
    if (!createdValue) return undefined;

    const created = await sendSourceJson(group.source.id, create, endpointMethod(group, create.endpoint), {
        resource,
        fields: { ...baseFields, ...previousDraft, [fieldId]: createdValue },
        value: createdValue,
    });
    const createdId = valueAt(created, create.valuePath);
    if (createdId === undefined || createdId === null || createdId === "") return undefined;
    const id = String(createdId);
    return {
        value: replaceCreatedValue(nextValue, createdValue, id),
        option: {
            value: id,
            label: textValue(valueAt(created, create.labelPath)) || createdValue,
        },
    };
}

function textValue(value: unknown): string {
    if (typeof value === "number" && Number.isFinite(value)) return String(value);
    return typeof value === "string" ? value.trim() : "";
}

function createdInput(previous: unknown, next: unknown): string {
    if (Array.isArray(next)) {
        const previousValues = new Set(arrayValue(previous));
        return arrayValue(next).find(value => !previousValues.has(value)) ?? "";
    }
    return typeof next === "string" ? next.trim() : "";
}

function replaceCreatedValue(next: unknown, created: string, id: string): unknown {
    if (Array.isArray(next)) return arrayValue(next).map(value => value === created ? id : value);
    return id;
}

function arrayValue(value: unknown): string[] {
    if (Array.isArray(value)) return value.map(item => String(item)).filter(Boolean);
    return typeof value === "string" ? value.split(",").map(item => item.trim()).filter(Boolean) : [];
}

function lookupField(widget: DetailWidget, fieldId: string): LookupField | null {
    const fields = [...widget.main, ...(widget.aside ?? [])].flatMap(section => section.fields);
    return fields.find((field): field is LookupField =>
        (field.type === "combobox" || field.type === "tokens") && field.id === fieldId,
    ) ?? null;
}

function endpointMethod(group: DashboardSourceGroup, endpointId: string): string {
    return group.endpoints.find(endpoint => endpoint.endpointId === endpointId)?.method ?? "POST";
}

function findDetailWidget(widgets: DashboardWidget[], id: string): DetailWidget | null {
    for (const widget of widgets) {
        if (widget.widget === "w-detail" && widget.id === id) return widget;
        if (widget.widget === "w-section") {
            const found = findDetailWidget(widget.children, id);
            if (found) return found;
        }
        if (widget.widget === "w-tabs") {
            for (const tab of widget.tabs) {
                const found = findDetailWidget(tab.children, id);
                if (found) return found;
            }
        }
    }
    return null;
}
