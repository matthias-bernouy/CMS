import type { WDetailFieldValue } from "../types";

export function badge(value: string): HTMLElement {
    const element = document.createElement("span");
    element.className = "badge";
    element.textContent = value;
    return element;
}

export function readonlyValue(value: WDetailFieldValue): HTMLElement {
    if (Array.isArray(value)) return readonlyList(value);
    const element = document.createElement("span");
    element.className = "readonly";
    element.textContent = String(value);
    return element;
}

function readonlyList(value: Extract<WDetailFieldValue, unknown[]>): HTMLElement {
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
