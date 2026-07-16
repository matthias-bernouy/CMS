import type { WDetailField, WDetailFieldValue } from "../types";
import { badge, image, readonlyValue } from "./display";
import {
    bindFieldControl,
    isTokenControl,
    isValueControl,
    optionElement,
    type TokenControl,
    type ValueControl,
} from "./shared";

export function createBasicControl(field: WDetailField): HTMLElement {
    if (field.input === "number") return numberInput(field);
    if (field.input === "checkbox") return checkbox(field);
    if (field.input === "textarea") return textarea(field);
    if (field.input === "select") return select(field);
    if (field.input === "combobox") return combobox(field);
    if (field.input === "tokens") return tokenInput(field);
    if (field.input === "chips") return chips(field);
    if (field.input === "badge") return badge(String(field.value));
    if (field.input === "image") return image(field);
    if (field.input === "readonly") return readonlyValue(field.value);
    return textInput(field);
}

export function fieldUsesBasicInternalLabel(field: WDetailField): boolean {
    return ["text", "number", "textarea", "select", "combobox", "tokens"].includes(field.input);
}

export function readBasicControlValue(field: WDetailField, control: HTMLElement): WDetailFieldValue {
    if (field.input === "chips") {
        return Array.from(control.querySelectorAll<HTMLButtonElement>("[aria-pressed='true']"))
            .map(button => button.dataset.value ?? "")
            .filter(Boolean);
    }
    if (field.input === "tokens" && isTokenControl(control)) return control.values;
    if (field.input === "checkbox" && control instanceof HTMLInputElement) return control.checked;
    if (field.input === "number" && isValueControl(control)) {
        if (control.value === "") return "";
        const value = Number(control.value);
        return Number.isFinite(value) ? value : "";
    }
    if (isValueControl(control)) return control.value;
    return Array.isArray(field.value) ? field.value : String(field.value);
}

function textInput(field: WDetailField): HTMLElement {
    const input = document.createElement("p9r-input") as ValueControl;
    input.setAttribute("label", field.label);
    input.setAttribute("type", "text");
    input.setAttribute("value", String(field.value));
    applyInputMetadata(input, field);
    input.value = String(field.value);
    bindFieldControl(input, field);
    return input;
}

function numberInput(field: WDetailField): HTMLElement {
    const input = document.createElement("p9r-input") as ValueControl;
    input.setAttribute("label", field.label);
    input.setAttribute("type", "number");
    input.setAttribute("value", String(field.value));
    for (const attribute of ["min", "max", "step"] as const) {
        const value = field[attribute];
        if (value !== undefined) input.setAttribute(attribute, String(value));
    }
    applyInputMetadata(input, field);
    input.value = String(field.value);
    bindFieldControl(input, field);
    return input;
}

function checkbox(field: WDetailField): HTMLElement {
    const input = document.createElement("input");
    input.type = "checkbox";
    input.className = "detail-checkbox";
    input.checked = field.value === true;
    input.required = field.required === true;
    input.setAttribute("aria-label", field.label);
    bindFieldControl(input, field);
    return input;
}

function textarea(field: WDetailField): HTMLElement {
    const input = document.createElement("p9r-textarea") as ValueControl;
    input.setAttribute("label", field.label);
    input.setAttribute("rows", String(field.rows ?? 4));
    input.setAttribute("value", String(field.value));
    applyInputMetadata(input, field);
    input.value = String(field.value);
    bindFieldControl(input, field);
    return input;
}

function select(field: WDetailField): HTMLElement {
    const input = document.createElement("p9r-select") as ValueControl;
    input.setAttribute("label", field.label);
    input.setAttribute("value", String(field.value));
    if (field.required) input.setAttribute("required", "");
    input.replaceChildren(...(field.options ?? []).map(option => optionElement(option, String(field.value))));
    bindFieldControl(input, field);
    return input;
}

function combobox(field: WDetailField): HTMLElement {
    const input = document.createElement("p9r-combobox") as ValueControl;
    input.setAttribute("label", field.label);
    input.setAttribute("value", String(field.value));
    input.setAttribute("placeholder", field.placeholder ?? "");
    if (field.required) input.setAttribute("required", "");
    if (field.creatable) input.setAttribute("creatable", "");
    input.replaceChildren(...(field.options ?? []).map(option => optionElement(option, String(field.value))));
    input.value = String(field.value);
    bindFieldControl(input, field);
    return input;
}

function tokenInput(field: WDetailField): HTMLElement {
    const input = document.createElement("p9r-token-input") as TokenControl;
    input.setAttribute("label", field.label);
    input.setAttribute("value", arrayValue(field).join(","));
    input.setAttribute("placeholder", field.placeholder ?? "");
    if (field.required) input.setAttribute("required", "");
    if (field.creatable) input.setAttribute("creatable", "");
    input.replaceChildren(...(field.options ?? []).map(option => optionElement(option, "")));
    bindFieldControl(input, field);
    return input;
}

function chips(field: WDetailField): HTMLElement {
    const selected = new Set(arrayValue(field));
    const group = document.createElement("div");
    group.className = "chip-group";
    bindFieldControl(group, field);
    for (const option of field.options ?? []) {
        const button = document.createElement("button");
        button.type = "button";
        button.className = "chip";
        button.dataset.value = option.value;
        button.setAttribute("aria-pressed", String(selected.has(option.value)));
        button.textContent = option.label;
        group.append(button);
    }
    return group;
}

function arrayValue(field: WDetailField): string[] {
    if (!Array.isArray(field.value)) return String(field.value).split(",").map(item => item.trim()).filter(Boolean);
    return field.value.filter((item): item is string => typeof item === "string");
}

function applyInputMetadata(input: HTMLElement, field: WDetailField): void {
    if (field.placeholder) input.setAttribute("placeholder", field.placeholder);
    if (field.required) input.setAttribute("required", "");
}
