import { emptyItem, renderComboItem } from "./list";
import type { ComboItem } from "./types";

export type ComboboxHandlers = {
    focus: () => void;
    input: () => void;
    keydown: (event: KeyboardEvent) => void;
    blur: () => void;
    clear: (event: MouseEvent) => void;
    options: () => void;
};

export class ComboboxView {
    readonly input: HTMLInputElement | null;
    readonly optionSlot: HTMLSlotElement | null;
    private readonly label: HTMLElement | null;
    private readonly listbox: HTMLElement | null;
    private readonly clearButton: HTMLButtonElement | null;
    private readonly chevron: SVGElement | null;

    constructor(
        root: ShadowRoot | null,
        private readonly internals: ElementInternals,
    ) {
        this.input = root?.querySelector("input") ?? null;
        this.label = root?.querySelector(".label") ?? null;
        this.listbox = root?.querySelector("[role='listbox']") ?? null;
        this.clearButton = root?.querySelector("[data-clear]") ?? null;
        this.chevron = root?.querySelector(".chevron") ?? null;
        this.optionSlot = root?.querySelector("slot") ?? null;
    }

    connect(handlers: ComboboxHandlers): void {
        this.input?.addEventListener("focus", handlers.focus);
        this.input?.addEventListener("input", handlers.input);
        this.input?.addEventListener("keydown", handlers.keydown);
        this.input?.addEventListener("blur", handlers.blur);
        this.clearButton?.addEventListener("mousedown", handlers.clear);
        this.optionSlot?.addEventListener("slotchange", handlers.options);
    }

    disconnect(handlers: ComboboxHandlers): void {
        this.input?.removeEventListener("focus", handlers.focus);
        this.input?.removeEventListener("input", handlers.input);
        this.input?.removeEventListener("keydown", handlers.keydown);
        this.input?.removeEventListener("blur", handlers.blur);
        this.clearButton?.removeEventListener("mousedown", handlers.clear);
        this.optionSlot?.removeEventListener("slotchange", handlers.options);
    }

    syncAttributes(host: HTMLElement, disabled: boolean): void {
        if (this.label) {
            const label = host.getAttribute("label") ?? "";
            this.label.textContent = label;
            this.label.hidden = label === "";
        }
        if (this.input) {
            this.input.placeholder = host.getAttribute("placeholder") ?? "";
            this.input.disabled = disabled;
        }
    }

    syncDisplay(selectedValue: string, selectedLabel: string): void {
        if (this.input && document.activeElement !== this.input) {
            this.input.value = selectedLabel;
        }
        this.internals.setFormValue(selectedValue);
        if (this.clearButton) {
            this.clearButton.hidden = selectedLabel === "";
        }
        if (this.chevron) {
            this.chevron.toggleAttribute("hidden", selectedLabel !== "");
        }
    }

    renderList(
        items: ComboItem[],
        activeIndex: number,
        selectedValue: string,
        onSelect: (item: ComboItem) => void,
    ): void {
        if (!this.listbox) {
            return;
        }
        this.listbox.replaceChildren(
            ...items.map((item, index) => renderComboItem(item, index, activeIndex, selectedValue, onSelect)),
        );
        if (items.length === 0) {
            this.listbox.append(emptyItem());
        }
        this.listbox.hidden = false;
        this.input?.setAttribute("aria-expanded", "true");
    }

    hideList(): void {
        if (this.listbox) {
            this.listbox.hidden = true;
        }
        this.input?.setAttribute("aria-expanded", "false");
        this.input?.removeAttribute("aria-activedescendant");
    }

    get listHidden(): boolean {
        return this.listbox?.hidden ?? true;
    }
}
