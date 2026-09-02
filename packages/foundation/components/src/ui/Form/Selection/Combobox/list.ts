import type { ComboItem, ComboOption } from "./types";
import type { ComboboxView } from "./ComboboxView";

export function comboOptionsFrom(host: HTMLElement): ComboOption[] {
    return Array.from(host.querySelectorAll("option")).map((option) => ({
        value: option.value,
        label: option.textContent ?? option.value,
        disabled: option.disabled,
    }));
}

export function comboItemsFor(options: ComboOption[], query: string, creatable = false): ComboItem[] {
    const needle = query.toLowerCase();
    const matches = needle ? options.filter((item) => item.label.toLowerCase().includes(needle)) : options;
    const items: ComboItem[] = matches.slice(0, 8).map((item) => ({ ...item, kind: "option" }));
    const exactMatch = options.some((item) => item.value === query || item.label.toLowerCase() === needle);
    if (creatable && query && !exactMatch) {
        items.unshift({ kind: "create", value: query, label: `Add "${query}"`, disabled: false });
        items.length = Math.min(items.length, 8);
    }
    return items;
}

export function remoteComboItemsFor(options: ComboOption[], query: string, creatable = false): ComboItem[] {
    const items: ComboItem[] = options.map((item) => ({ ...item, kind: "option" }));
    const needle = query.toLowerCase();
    const exactMatch = options.some((item) => item.value === query || item.label.toLowerCase() === needle);
    if (creatable && query && !exactMatch) {
        items.unshift({ kind: "create", value: query, label: `Add "${query}"`, disabled: false });
    }
    return items;
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
    row.setAttribute("aria-selected", row.dataset.selected);
    row.addEventListener("mousedown", (event) => {
        event.preventDefault();
        if (!item.disabled) {
            onSelect(item);
        }
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

export function statusItem(label: string, className: "loading" | "load-more", onSelect?: () => void): HTMLElement {
    const row = document.createElement(onSelect ? "button" : "div");
    row.className = className;
    row.textContent = label;
    if (row instanceof HTMLButtonElement) {
        row.type = "button";
        row.addEventListener("mousedown", (event) => {
            event.preventDefault();
            onSelect?.();
        });
    } else {
        row.setAttribute("role", "status");
    }
    return row;
}

export function createPromptItem(label: string, onSelect: () => void): HTMLElement {
    const row = document.createElement("div");
    row.className = "option create";
    row.setAttribute("role", "option");
    row.addEventListener("mousedown", (event) => {
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

export class ComboboxKeyboard {
    activeIndex = -1;

    constructor(
        private readonly view: ComboboxView,
        private readonly getItems: () => ComboItem[],
        private readonly getQuery: () => string,
        private readonly renderList: (query: string) => void,
        private readonly selectItem: (item: ComboItem) => void,
        private readonly syncDisplay: () => void,
    ) {}

    reset(): void {
        this.activeIndex = -1;
    }

    hide(): void {
        this.view.hideList();
        this.reset();
    }

    get query(): string {
        return this.getQuery();
    }

    handle(event: KeyboardEvent): void {
        if (event.key === "ArrowDown" || event.key === "ArrowUp") {
            this.moveActive(event);
        } else if (event.key === "Enter") {
            const first = this.getItems()[0];
            const item = this.getItems()[this.activeIndex] ?? (first?.kind === "create" ? first : undefined);
            if (item) {
                event.preventDefault();
                this.selectItem(item);
            }
        } else if (event.key === "Escape") {
            event.preventDefault();
            this.hide();
            this.syncDisplay();
        }
    }

    private moveActive(event: KeyboardEvent): void {
        event.preventDefault();
        if (this.view.listHidden) {
            this.renderList(this.getQuery());
        }
        const items = this.getItems();
        if (items.length === 0) {
            return;
        }
        const step = event.key === "ArrowDown" ? 1 : -1;
        this.activeIndex = Math.max(0, Math.min(items.length - 1, this.activeIndex + step));
        this.renderList(this.getQuery());
        this.view.input?.setAttribute("aria-activedescendant", `option-${this.activeIndex}`);
    }
}
