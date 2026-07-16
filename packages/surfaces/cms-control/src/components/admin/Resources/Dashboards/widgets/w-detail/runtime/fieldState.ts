import type { DashboardWidget } from "@bernouy/cms-dashboards";
import { valueAt } from "../../../runtime/expressions";
import { readFieldControlValue } from "../controls";
import type { WDetailData, WDetailField } from "../types";

export type DetailWidget = Extract<DashboardWidget, { widget: "w-detail" }>;

export type DetailBinding = {
    widget: DetailWidget;
    resource: unknown;
    rowKey: string;
    sourceId: string;
};

export class DetailFieldState {
    private scopeKey = "";
    private values: Record<string, unknown> = {};

    constructor(
        private readonly root: ShadowRoot,
        private readonly dataset: DOMStringMap,
        private readonly readData: () => WDetailData,
    ) {}

    get draft(): Record<string, unknown> {
        return this.values;
    }

    syncScope(scopeKey: string): void {
        if (this.scopeKey === scopeKey) return;
        this.scopeKey = scopeKey;
        this.values = {};
    }

    clear(): void {
        this.scopeKey = "";
        this.values = {};
    }

    record(fieldId: string, value: unknown): void {
        this.values[fieldId] = value;
    }

    find(fieldId: string): WDetailField | undefined {
        return this.fields().find(field => field.id === fieldId);
    }

    fields(): WDetailField[] {
        const data = this.readData();
        return [...data.main, ...data.aside].flatMap(section => section.fields);
    }

    currentResource(): unknown | undefined {
        return readDetailBinding(this.dataset)?.resource;
    }

    currentFields(): Record<string, unknown> {
        const fields: Record<string, unknown> = { ...this.values };
        const fieldsById = new Map(this.fields().map(field => [field.id, field]));
        for (const control of Array.from(this.root.querySelectorAll<HTMLElement>("[data-field-control]"))) {
            const field = fieldsById.get(control.dataset.fieldControl ?? "");
            if (field) fields[field.id] = readFieldControlValue(field, control);
        }
        return fields;
    }

    control(fieldId: string): HTMLElement | null {
        return Array.from(this.root.querySelectorAll<HTMLElement>("[data-field-control]"))
            .find(control => control.dataset.fieldControl === fieldId) ?? null;
    }
}

export function readDetailBinding(dataset: DOMStringMap): DetailBinding | null {
    const widget = parseJson<DetailWidget>(dataset.configJson ?? "");
    const sourceJson = dataset.sourceJson ?? "";
    const sourceData = parseJson<unknown>(sourceJson);
    if (!widget || widget.widget !== "w-detail" || !sourceJson || sourceData === null) return null;
    const resource = widget.source.itemPath ? valueAt(sourceData, widget.source.itemPath) : sourceData;
    if (resource === undefined) return null;
    return {
        widget,
        resource,
        rowKey: dataset.rowKey ?? "",
        sourceId: dataset.sourceId ?? "",
    };
}

export function parseJson<T>(value: string): T | null {
    if (!value) return null;
    try {
        return JSON.parse(value) as T;
    } catch {
        return null;
    }
}
