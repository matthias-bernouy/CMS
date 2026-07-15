import type { WDetailField, WDetailSchemaDefinition } from "../types";
import { bindFieldControl, isValueControl, optionElement, type ValueControl } from "./shared";

export function createSchemaControl(field: WDetailField): HTMLElement {
    const root = document.createElement("div");
    root.className = "detail-schema";
    bindFieldControl(root, field);
    root.addEventListener("input", markDirty);
    root.addEventListener("change", markDirty);
    const definitions = field.schemaDefinitions ?? [];
    if (field.schemaStatus !== "ready") {
        root.append(statusMessage(field.schemaStatus));
        return root;
    }
    if (definitions.length === 0) {
        root.append(statusMessage("empty"));
        return root;
    }
    const values = recordValue(field.value);
    root.append(...definitions.map(definition => schemaRow(definition, values[definition.id])));
    return root;
}

export function readSchemaControlValue(field: WDetailField, control: HTMLElement): Record<string, unknown> {
    const result = recordValue(field.value);
    if (field.schemaStatus !== "ready") return result;
    const definitions = new Map((field.schemaDefinitions ?? []).map(definition => [definition.id, definition]));
    for (const element of Array.from(control.querySelectorAll<HTMLElement>("[data-schema-key]"))) {
        const key = element.dataset.schemaKey ?? "";
        const definition = definitions.get(key);
        if (!definition || element.dataset.schemaDirty !== "true") continue;
        result[key] = readSchemaValue(definition, element);
    }
    return result;
}

function schemaRow(definition: WDetailSchemaDefinition, value: unknown): HTMLElement {
    const row = document.createElement("div");
    row.className = "detail-schema-row";
    const control = schemaInput(definition, value);
    control.dataset.schemaKey = definition.id;
    row.append(control);
    if (definition.unit) {
        const unit = document.createElement("span");
        unit.className = "detail-schema-unit";
        unit.textContent = definition.unit;
        row.append(unit);
    }
    return row;
}

function schemaInput(definition: WDetailSchemaDefinition, value: unknown): HTMLElement {
    if (definition.type === "boolean") {
        const input = document.createElement("input");
        input.type = "checkbox";
        input.className = "detail-checkbox";
        input.checked = value === true;
        input.required = definition.required === true;
        input.setAttribute("aria-label", definition.label);
        return input;
    }
    if (definition.options?.length) {
        const input = document.createElement("p9r-select") as ValueControl;
        const selected = textValue(value);
        input.setAttribute("label", definition.label);
        input.setAttribute("value", selected);
        if (definition.required) input.setAttribute("required", "");
        input.replaceChildren(...definition.options.map(option => optionElement(option, selected)));
        input.value = selected;
        return input;
    }
    const input = document.createElement("p9r-input") as ValueControl;
    input.setAttribute("label", definition.label);
    input.setAttribute("type", definition.type === "number" ? "number" : "text");
    input.setAttribute("value", textValue(value));
    if (definition.required) input.setAttribute("required", "");
    input.value = textValue(value);
    return input;
}

function readSchemaValue(definition: WDetailSchemaDefinition, control: HTMLElement): unknown {
    if (definition.type === "boolean" && control instanceof HTMLInputElement) return control.checked;
    if (!isValueControl(control)) return undefined;
    if (definition.type !== "number" || control.value === "") return control.value;
    const value = Number(control.value);
    return Number.isFinite(value) ? value : "";
}

function markDirty(event: Event): void {
    const control = (event.target as Element | null)?.closest<HTMLElement>("[data-schema-key]");
    if (control) control.dataset.schemaDirty = "true";
}

function statusMessage(status: WDetailField["schemaStatus"] | "empty"): HTMLElement {
    const message = document.createElement("span");
    message.className = `detail-schema-status detail-schema-status-${status ?? "loading"}`;
    message.textContent = status === "error"
        ? "Dynamic fields are temporarily unavailable. Existing values are preserved."
        : status === "empty"
            ? "No dynamic fields are configured."
            : "Loading dynamic fields…";
    return message;
}

function recordValue(value: unknown): Record<string, unknown> {
    return value !== null && typeof value === "object" && !Array.isArray(value)
        ? { ...(value as Record<string, unknown>) }
        : {};
}

function textValue(value: unknown): string {
    return value === null || value === undefined ? "" : String(value);
}
