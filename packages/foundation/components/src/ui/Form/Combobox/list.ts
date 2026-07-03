import type { ComboItem, ComboOption } from "./types";

export function comboOptionsFrom(host: HTMLElement): ComboOption[] {
    return Array.from(host.querySelectorAll("option")).map(option => ({
        value: option.value,
        label: option.textContent ?? option.value,
        disabled: option.disabled,
    }));
}

export function comboItemsFor(options: ComboOption[], query: string): ComboItem[] {
    const needle = query.toLowerCase();
    const matches = needle ? options.filter(item => item.label.toLowerCase().includes(needle)) : options;
    return matches.slice(0, 8).map(item => ({ ...item, kind: "option" }));
}

export function renderComboItem(
    item: ComboItem,
    index: number,
    activeIndex: number,
    selectedValue: string,
    onSelect: (item: ComboItem) => void,
): HTMLElement {
    const row = document.createElement("div");
    row.className = `option ${item.kind}`;
    row.id = `option-${index}`;
    row.dataset.active = String(index === activeIndex);
    row.dataset.selected = String(item.kind === "option" && item.value === selectedValue);
    row.setAttribute("role", "option");
    row.setAttribute("aria-selected", row.dataset.active);
    row.addEventListener("mousedown", event => {
        event.preventDefault();
        if (!item.disabled) onSelect(item);
    });
    row.append(indicator(), optionLabel(item.label));
    return row;
}

export function emptyItem(): HTMLElement {
    const row = document.createElement("div");
    row.className = "empty";
    row.textContent = "No results";
    return row;
}

export function createPromptItem(label: string, onSelect: () => void): HTMLElement {
    const row = document.createElement("div");
    row.className = "option create";
    row.setAttribute("role", "option");
    row.addEventListener("mousedown", event => {
        event.preventDefault();
        onSelect();
    });
    row.append(indicator(), optionLabel(label));
    return row;
}

function indicator(): HTMLElement {
    const element = document.createElement("span");
    element.className = "indicator";
    return element;
}

function optionLabel(text: string): HTMLElement {
    const element = document.createElement("span");
    element.className = "option-label";
    element.textContent = text;
    return element;
}
