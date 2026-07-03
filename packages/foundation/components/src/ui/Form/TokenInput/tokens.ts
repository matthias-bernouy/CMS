import { comboItemsFor } from "../Combobox/list";
import type { ComboItem, ComboOption } from "../Combobox/types";

export function parseTokens(value: string): string[] {
    return value.split(",").map(item => item.trim()).filter(Boolean);
}

export function tokenValue(values: string[]): string {
    return values.join(",");
}

export function tokenLabels(values: string[], options: ComboOption[]): ComboOption[] {
    return values.map(value => options.find(option => option.value === value) ?? { value, label: value, disabled: false });
}

export function tokenItemsFor(options: ComboOption[], selected: string[], query: string, creatable: boolean): ComboItem[] {
    const remaining = options.filter(item => !selected.includes(item.value));
    const items = comboItemsFor(remaining, query);
    if (items.length > 0 || !query || !creatable || selected.includes(query)) return items;
    return [{ kind: "create", value: query, label: `Add "${query}"`, disabled: false }];
}

export function tokenElement(item: ComboOption, onRemove: (value: string) => void): HTMLElement {
    const token = document.createElement("span");
    token.className = "token";
    const label = document.createElement("span");
    label.textContent = item.label;
    const remove = document.createElement("button");
    remove.type = "button";
    remove.setAttribute("aria-label", `Remove ${item.label}`);
    remove.textContent = "x";
    remove.addEventListener("click", () => onRemove(item.value));
    token.append(label, remove);
    return token;
}
