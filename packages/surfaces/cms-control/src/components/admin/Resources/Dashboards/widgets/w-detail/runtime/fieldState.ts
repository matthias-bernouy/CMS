import type { DashboardWidget } from "@bernouy/cms-dashboards";
import { valueAt } from "../../../runtime/expressions";
import { readFieldControlValue } from "../controls";
import type { WDetailData, WDetailField } from "../types";

export type DetailWidget = Extract<DashboardWidget, { widget: "w-detail" }>;

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
        const widget = parseJson<DetailWidget>(this.dataset.configJson ?? "");
        if (!widget || widget.widget !== "w-detail") return undefined;
        const sourceData = parseJson<unknown>(this.dataset.sourceJson ?? "");
        if (sourceData === null) return undefined;
        return widget.source.itemPath ? valueAt(sourceData, widget.source.itemPath) : sourceData;
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

export function parseJson<T>(value: string): T | null {
    if (!value) return null;
    try {
        return JSON.parse(value) as T;
    } catch {
        return null;
    }
}
