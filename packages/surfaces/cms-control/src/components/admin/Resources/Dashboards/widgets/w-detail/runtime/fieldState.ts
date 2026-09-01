import type { DashboardWidget } from "@bernouy/cms-dashboards";
import { valueAt } from "../../../runtime/expressions";
import { invalidFieldControl, readFieldControlValue } from "../controls";
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
        if (this.scopeKey === scopeKey) {
            return;
        }
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
        return this.fields().find((field) => field.id === fieldId);
    }

    fields(): WDetailField[] {
        const data = this.readData();
        return [...data.main, ...data.aside].flatMap((section) => section.fields);
    }

    currentResource(): unknown | undefined {
        return readDetailBinding(this.dataset)?.resource;
    }

    currentFields(): Record<string, unknown> {
        const fields: Record<string, unknown> = { ...this.values };
        const fieldsById = new Map(this.fields().map((field) => [field.id, field]));
        for (const control of Array.from(this.root.querySelectorAll<HTMLElement>("[data-field-control]"))) {
            const field = fieldsById.get(control.dataset.fieldControl ?? "");
            if (field) {
                fields[field.id] = readFieldControlValue(field, control);
            }
        }
        return fields;
    }

    validate(): boolean {
        const values = this.currentFields();
        let invalid: HTMLElement | null = null;
        for (const field of this.fields()) {
            const control = this.control(field.id);
            if (!control) {
                continue;
            }
            this.syncRequiredValidity(field, control, values[field.id]);
            invalid ??= invalidFieldControl(field, control);
        }
        invalid ??= this.root.querySelector<HTMLElement>("[data-field-control][invalid]");
        invalid?.focus();
        return invalid === null;
    }

    refreshRequiredValidity(control: HTMLElement): void {
        const field = this.find(control.dataset.fieldControl ?? "");
        if (!field) {
            return;
        }
        this.syncRequiredValidity(field, control, readFieldControlValue(field, control));
    }

    control(fieldId: string): HTMLElement | null {
        return (
            Array.from(this.root.querySelectorAll<HTMLElement>("[data-field-control]")).find(
                (control) => control.dataset.fieldControl === fieldId,
            ) ?? null
        );
    }

    private syncRequiredValidity(field: WDetailField, control: HTMLElement, value: unknown): void {
        if (!field.required) {
            clearRequiredError(control);
            return;
        }
        if (missingRequiredValue(value, field.input)) {
            control.dataset.dashboardRequiredInvalid = "true";
            control.setAttribute("invalid", "");
            control.setAttribute("aria-invalid", "true");
            control.setAttribute("hint", "This field is required.");
            control.setAttribute("hint-level", "error");
            return;
        }
        clearRequiredError(control);
    }
}

function missingRequiredValue(value: unknown, input: WDetailField["input"]): boolean {
    if (input === "checkbox") {
        return value !== true;
    }
    if (value === null || value === undefined) {
        return true;
    }
    if (typeof value === "string") {
        return value.trim() === "";
    }
    if (Array.isArray(value)) {
        return value.length === 0;
    }
    return typeof value === "object" && Object.keys(value as Record<string, unknown>).length === 0;
}

function clearRequiredError(control: HTMLElement): void {
    if (control.dataset.dashboardRequiredInvalid !== "true") {
        return;
    }
    delete control.dataset.dashboardRequiredInvalid;
    control.removeAttribute("invalid");
    control.removeAttribute("aria-invalid");
    control.removeAttribute("hint");
    control.removeAttribute("hint-level");
}

export function readDetailBinding(dataset: DOMStringMap): DetailBinding | null {
    const widget = parseJson<DetailWidget>(dataset.configJson ?? "");
    const sourceJson = dataset.sourceJson ?? "";
    const sourceData = parseJson<unknown>(sourceJson);
    if (!widget || widget.widget !== "w-detail" || !sourceJson || sourceData === null) {
        return null;
    }
    const resource = widget.source.itemPath ? valueAt(sourceData, widget.source.itemPath) : sourceData;
    if (resource === undefined) {
        return null;
    }
    return {
        widget,
        resource,
        rowKey: dataset.rowKey ?? "",
        sourceId: dataset.sourceId ?? "",
    };
}

export function parseJson<T>(value: string): T | null {
    if (!value) {
        return null;
    }
    try {
        return JSON.parse(value) as T;
    } catch {
        return null;
    }
}
