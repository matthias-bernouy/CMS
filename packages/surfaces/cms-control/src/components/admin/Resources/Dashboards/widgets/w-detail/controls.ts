import type { WDetailField, WDetailFieldValue } from "./types";
import { isMediaControl, mediaList } from "./mediaControl";

type ValueControl = HTMLElement & { value: string };
type TokenControl = ValueControl & { values: string[] };

export function createFieldControl(field: WDetailField): HTMLElement {
    if (field.input === "textarea") return textarea(field);
    if (field.input === "select") return select(field);
    if (field.input === "combobox") return combobox(field);
    if (field.input === "tokens") return tokenInput(field);
    if (field.input === "media-list") return mediaList(field);
    if (field.input === "chips") return chips(field);
    if (field.input === "badge") return badge(String(field.value));
    if (field.input === "readonly") return readonly(field.value);
    return textInput(field);
}

export function fieldUsesInternalLabel(field: WDetailField): boolean {
    return ["text", "textarea", "select", "combobox", "tokens", "media-list"].includes(field.input);
}

export function readFieldControlValue(field: WDetailField, control: HTMLElement): WDetailFieldValue {
    if (field.input === "chips") {
        return Array.from(control.querySelectorAll<HTMLButtonElement>("[aria-pressed='true']"))
            .map(button => button.dataset.value ?? "")
            .filter(Boolean);
    }
    if (field.input === "tokens" && isTokenControl(control)) return control.values;
    if (field.input === "media-list" && isMediaControl(control)) return control.items;
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

function bindFieldControl(control: HTMLElement, field: WDetailField): void {
    control.dataset.fieldControl = field.id;
}

function optionElement(option: { label: string; value: string }, value: string): HTMLOptionElement {
    const element = document.createElement("option");
    element.value = option.value;
    element.textContent = option.label;
    element.selected = option.value === value;
    return element;
}

function isValueControl(control: HTMLElement): control is ValueControl {
    return "value" in control && typeof (control as ValueControl).value === "string";
}

function isTokenControl(control: HTMLElement): control is TokenControl {
    return isValueControl(control) && "values" in control && Array.isArray((control as TokenControl).values);
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
    const element = document.createElement("span");
    element.className = "readonly";
    element.textContent = Array.isArray(value) ? value.map(item => typeof item === "string" ? item : item.id).join(", ") : value;
    return element;
}
