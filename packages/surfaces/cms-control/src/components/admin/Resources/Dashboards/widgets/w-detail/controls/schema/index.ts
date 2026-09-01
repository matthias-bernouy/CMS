import type { WDetailField, WDetailSchemaDefinition } from "../../types";
import { bindFieldControl, selectOptionElements, type ValueControl } from "../shared";
import { recordValue, updateSchemaControl } from "./runtime";

export { readSchemaControlValue, validateSchemaControl } from "./runtime";

export function createSchemaControl(field: WDetailField): HTMLElement {
    const root = document.createElement("div");
    root.className = "detail-schema";
    bindFieldControl(root, field);
    root.addEventListener("input", (event) => updateSchemaControl(field, event));
    root.addEventListener("change", (event) => updateSchemaControl(field, event));
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
    root.append(...definitions.map((definition) => schemaRow(definition, values[definition.id])));
    return root;
}

function schemaRow(definition: WDetailSchemaDefinition, value: unknown): HTMLElement {
    const row = document.createElement("div");
    row.className = "detail-schema-row";
    const control = schemaInput(definition, value);
    control.dataset.schemaKey = definition.id;
    row.append(definition.type === "boolean" ? checkboxLabel(definition, control) : control);
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
        return schemaCheckbox(definition, value);
    }
    if (definition.options?.length) {
        return schemaSelect(definition, value);
    }
    const input = document.createElement("p9r-input") as ValueControl;
    input.setAttribute("label", definition.label);
    input.setAttribute("type", definition.type === "number" ? "number" : "text");
    input.setAttribute("value", textValue(value));
    if (definition.required) {
        input.setAttribute("required", "");
    }
    input.value = textValue(value);
    return input;
}

function schemaCheckbox(definition: WDetailSchemaDefinition, value: unknown): HTMLInputElement {
    const input = document.createElement("input");
    input.type = "checkbox";
    input.className = "detail-checkbox";
    input.checked = value === true;
    input.setAttribute("aria-label", definition.label);
    if (definition.required) {
        input.setAttribute("aria-required", "true");
    }
    return input;
}

function schemaSelect(definition: WDetailSchemaDefinition, value: unknown): HTMLElement {
    const input = document.createElement("p9r-select") as ValueControl;
    const selected = textValue(value);
    input.setAttribute("label", definition.label);
    input.setAttribute("value", selected);
    if (definition.required) {
        input.setAttribute("required", "");
    }
    input.replaceChildren(...selectOptionElements(definition.options ?? [], selected));
    input.value = selected;
    return input;
}

function checkboxLabel(definition: WDetailSchemaDefinition, control: HTMLElement): HTMLElement {
    const label = document.createElement("label");
    label.className = "detail-schema-checkbox";
    label.toggleAttribute("data-required", definition.required);
    const text = document.createElement("span");
    text.textContent = definition.label;
    label.append(control, text);
    return label;
}

function statusMessage(status: WDetailField["schemaStatus"] | "empty"): HTMLElement {
    const message = document.createElement("span");
    message.className = `detail-schema-status detail-schema-status-${status ?? "loading"}`;
    message.textContent =
        status === "error"
            ? "Dynamic fields are temporarily unavailable. Existing values are preserved."
            : status === "empty"
              ? "No dynamic fields are configured."
              : "Loading dynamic fields…";
    return message;
}

function textValue(value: unknown): string {
    return value === null || value === undefined ? "" : String(value);
}
