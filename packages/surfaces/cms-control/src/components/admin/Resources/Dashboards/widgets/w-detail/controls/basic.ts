import type { WDetailField, WDetailFieldValue } from "../types";
import { parseMajorUnits } from "../../../runtime/mapping/money";
import { badge, image, readonlyValue } from "./display";
import { combobox, moneyInput, numberInput, select, textInput, textarea, tokenInput } from "./inputFields";
import { bindFieldControl, isTokenControl, isValueControl, type ValueControl } from "./shared";

export function createBasicControl(field: WDetailField): HTMLElement {
    if (field.input === "number") {
        return numberInput(field);
    }
    if (field.input === "money") {
        return moneyInput(field);
    }
    if (field.input === "checkbox") {
        return checkbox(field);
    }
    if (field.input === "textarea") {
        return textarea(field);
    }
    if (field.input === "select") {
        return select(field);
    }
    if (field.input === "combobox" || field.input === "cms-user") {
        return combobox(field);
    }
    if (field.input === "tokens") {
        return tokenInput(field);
    }
    if (field.input === "chips") {
        return chips(field);
    }
    if (field.input === "badge") {
        return badge(String(field.value));
    }
    if (field.input === "image") {
        return image(field);
    }
    if (field.input === "readonly") {
        return readonlyValue(field.value);
    }
    return textInput(field);
}

export function fieldUsesBasicInternalLabel(field: WDetailField): boolean {
    return ["text", "number", "money", "textarea", "select", "cms-user", "combobox", "tokens"].includes(field.input);
}

export function readBasicControlValue(field: WDetailField, control: HTMLElement): WDetailFieldValue {
    if (field.input === "chips") {
        return Array.from(control.querySelectorAll<HTMLButtonElement>("[aria-pressed='true']"))
            .map((button) => button.dataset.value ?? "")
            .filter(Boolean);
    }
    if (field.input === "tokens" && isTokenControl(control)) {
        return control.values;
    }
    if (field.input === "checkbox" && control instanceof HTMLInputElement) {
        return control.checked;
    }
    if (field.input === "number" && isValueControl(control)) {
        if (control.value === "") {
            return "";
        }
        const value = Number(control.value);
        return Number.isFinite(value) ? value : "";
    }
    if (field.input === "money" && isValueControl(control)) {
        return readMoneyControlValue(field, control);
    }
    if (isValueControl(control)) {
        return control.value;
    }
    return Array.isArray(field.value) ? field.value : String(field.value);
}

function readMoneyControlValue(field: WDetailField, control: ValueControl): number | "" {
    const result = parseMajorUnits(control.value, field.fractionDigits ?? 2, field.allowDecimals !== false);
    if (!result.ok) {
        setMoneyError(control, result.message);
        return "";
    }
    if (field.required && result.value === "") {
        setMoneyError(control, "This field is required.");
        return "";
    }
    control.removeAttribute("invalid");
    control.removeAttribute("hint");
    control.removeAttribute("hint-level");
    return result.value;
}

function setMoneyError(control: HTMLElement, message: string): void {
    control.setAttribute("invalid", "");
    control.setAttribute("hint", message);
    control.setAttribute("hint-level", "error");
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
    if (!Array.isArray(field.value)) {
        return String(field.value)
            .split(",")
            .map((item) => item.trim())
            .filter(Boolean);
    }
    return field.value.filter((item): item is string => typeof item === "string");
}
