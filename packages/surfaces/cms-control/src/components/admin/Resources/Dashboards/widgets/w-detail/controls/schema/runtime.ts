import type { WDetailField, WDetailSchemaDefinition } from "../../types";
import { isValueControl } from "../shared";

export function readSchemaControlValue(field: WDetailField, control: HTMLElement): Record<string, unknown> {
    const result = recordValue(field.value);
    if (field.schemaStatus !== "ready") {
        return result;
    }
    const definitions = new Map((field.schemaDefinitions ?? []).map((definition) => [definition.id, definition]));
    for (const element of Array.from(control.querySelectorAll<HTMLElement>("[data-schema-key]"))) {
        const key = element.dataset.schemaKey ?? "";
        const definition = definitions.get(key);
        if (!definition || !shouldReadSchemaValue(definition, element, result)) {
            continue;
        }
        result[key] = readSchemaValue(definition, element);
    }
    return result;
}

export function validateSchemaControl(field: WDetailField, control: HTMLElement): HTMLElement | null {
    if (field.schemaStatus !== "ready") {
        return null;
    }
    const definitions = new Map((field.schemaDefinitions ?? []).map((definition) => [definition.id, definition]));
    let invalid: HTMLElement | null = null;
    for (const element of Array.from(control.querySelectorAll<HTMLElement>("[data-schema-key]"))) {
        const definition = definitions.get(element.dataset.schemaKey ?? "");
        if (!definition) {
            continue;
        }
        syncSchemaRequiredValidity(definition, element);
        if (!invalid && element.hasAttribute("invalid")) {
            invalid = element;
        }
    }
    return invalid;
}

export function updateSchemaControl(field: WDetailField, event: Event): void {
    const control = (event.target as Element | null)?.closest<HTMLElement>("[data-schema-key]");
    const definition = (field.schemaDefinitions ?? []).find((item) => item.id === control?.dataset.schemaKey);
    if (!control || !definition) {
        return;
    }
    control.dataset.schemaDirty = "true";
    syncSchemaRequiredValidity(definition, control);
}

export function recordValue(value: unknown): Record<string, unknown> {
    return value !== null && typeof value === "object" && !Array.isArray(value)
        ? { ...(value as Record<string, unknown>) }
        : {};
}

function readSchemaValue(definition: WDetailSchemaDefinition, control: HTMLElement): unknown {
    if (definition.type === "boolean" && control instanceof HTMLInputElement) {
        return control.checked;
    }
    if (!isValueControl(control)) {
        return undefined;
    }
    if (definition.type !== "number" || control.value === "") {
        return control.value;
    }
    const value = Number(control.value);
    return Number.isFinite(value) ? value : "";
}

function shouldReadSchemaValue(
    definition: WDetailSchemaDefinition,
    control: HTMLElement,
    values: Record<string, unknown>,
): boolean {
    return (
        control.dataset.schemaDirty === "true" ||
        (!Object.hasOwn(values, definition.id) && definition.required === true && definition.type === "boolean")
    );
}

function syncSchemaRequiredValidity(definition: WDetailSchemaDefinition, control: HTMLElement): void {
    if (!definition.required || !missingRequiredValue(readSchemaValue(definition, control))) {
        clearSchemaRequiredError(control);
        return;
    }
    control.dataset.dashboardSchemaRequiredInvalid = "true";
    control.setAttribute("invalid", "");
    control.setAttribute("aria-invalid", "true");
    control.setAttribute("hint", "This field is required.");
    control.setAttribute("hint-level", "error");
}

function missingRequiredValue(value: unknown): boolean {
    return value === null || value === undefined || (typeof value === "string" && value.trim() === "");
}

function clearSchemaRequiredError(control: HTMLElement): void {
    if (control.dataset.dashboardSchemaRequiredInvalid !== "true") {
        return;
    }
    delete control.dataset.dashboardSchemaRequiredInvalid;
    control.removeAttribute("invalid");
    control.removeAttribute("aria-invalid");
    control.removeAttribute("hint");
    control.removeAttribute("hint-level");
}
