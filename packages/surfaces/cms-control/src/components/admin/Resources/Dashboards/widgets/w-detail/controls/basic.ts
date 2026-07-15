import type { WDetailField, WDetailFieldValue } from "../types";
import {
    bindFieldControl,
    isTokenControl,
    isValueControl,
    optionElement,
    type TokenControl,
    type ValueControl,
} from "./shared";

export function createBasicControl(field: WDetailField): HTMLElement {
    if (field.input === "textarea") return textarea(field);
    if (field.input === "select") return select(field);
    if (field.input === "combobox") return combobox(field);
    if (field.input === "tokens") return tokenInput(field);
    if (field.input === "chips") return chips(field);
    if (field.input === "badge") return badge(String(field.value));
    if (field.input === "readonly") return readonly(field.value);
    return textInput(field);
}

export function fieldUsesBasicInternalLabel(field: WDetailField): boolean {
    return ["text", "textarea", "select", "combobox", "tokens"].includes(field.input);
}

export function readBasicControlValue(field: WDetailField, control: HTMLElement): WDetailFieldValue {
    if (field.input === "chips") {
        return Array.from(control.querySelectorAll<HTMLButtonElement>("[aria-pressed='true']"))
            .map(button => button.dataset.value ?? "")
            .filter(Boolean);
    }
    if (field.input === "tokens" && isTokenControl(control)) return control.values;
    if (isValueControl(control)) return control.value;
    return Array.isArray(field.value) ? field.value : String(field.value);
}

function textInput(field: WDetailField): HTMLElement {
    const input = document.createElement("p9r-input") as ValueControl;
    input.setAttribute("label", field.label);
    input.setAttribute("type", "text");
    input.setAttribute("value", String(field.value));
    input.value = String(field.value);
    bindFieldControl(input, field);
    return input;
}

function textarea(field: WDetailField): HTMLElement {
    const input = document.createElement("p9r-textarea") as ValueControl;
    input.setAttribute("label", field.label);
    input.setAttribute("rows", "4");
    input.setAttribute("value", String(field.value));
    input.value = String(field.value);
    bindFieldControl(input, field);
    return input;
}

function select(field: WDetailField): HTMLElement {
    const input = document.createElement("p9r-select") as ValueControl;
    input.setAttribute("label", field.label);
    input.setAttribute("value", String(field.value));
    input.replaceChildren(...(field.options ?? []).map(option => optionElement(option, String(field.value))));
    bindFieldControl(input, field);
    return input;
}

function combobox(field: WDetailField): HTMLElement {
    const input = document.createElement("p9r-combobox") as ValueControl;
    input.setAttribute("label", field.label);
    input.setAttribute("value", String(field.value));
    input.setAttribute("placeholder", field.placeholder ?? "");
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

function badge(value: string): HTMLElement {
    const element = document.createElement("span");
    element.className = "badge";
    element.textContent = value;
    return element;
}

function readonly(value: WDetailFieldValue): HTMLElement {
    if (Array.isArray(value)) return readonlyList(value);
    const element = document.createElement("span");
    element.className = "readonly";
    element.textContent = value;
    return element;
}

function readonlyList(value: Exclude<WDetailFieldValue, string>): HTMLElement {
    if (!value.length) {
        const element = document.createElement("span");
        element.className = "readonly readonly-empty";
        element.textContent = "None";
        return element;
    }
    const list = document.createElement("ul");
    list.className = "readonly readonly-list";
    for (const item of value) {
        const text = typeof item === "string" ? item : String(item.id ?? "");
        if (!text) continue;
        const entry = document.createElement("li");
        entry.textContent = text;
        list.append(entry);
    }
    return list;
}
