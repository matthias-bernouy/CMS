import { renderComboItem } from "../../Selection/Combobox/list";
import type { ComboItem, ComboOption } from "../../Selection/Combobox/types";
import { tokenElement, tokenLabels } from "./tokens";

export type TokenInputHandlers = {
    focus: () => void;
    input: () => void;
    keydown: (event: KeyboardEvent) => void;
    blur: () => void;
    create: (event: MouseEvent) => void;
    options: () => void;
};

export class TokenInputView {
    readonly input: HTMLInputElement | null;
    readonly optionSlot: HTMLSlotElement | null;
    private readonly label: HTMLElement | null;
    private readonly tokens: HTMLElement | null;
    private readonly listbox: HTMLElement | null;
    private readonly createButton: HTMLButtonElement | null;

    constructor(
        root: ShadowRoot | null,
        private readonly internals: ElementInternals,
    ) {
        this.input = root?.querySelector("input") ?? null;
        this.label = root?.querySelector(".label") ?? null;
        this.tokens = root?.querySelector("[data-tokens]") ?? null;
        this.listbox = root?.querySelector("[role='listbox']") ?? null;
        this.createButton = root?.querySelector("[data-create]") ?? null;
        this.optionSlot = root?.querySelector("slot") ?? null;
    }

    connect(handlers: TokenInputHandlers): void {
        this.input?.addEventListener("focus", handlers.focus);
        this.input?.addEventListener("input", handlers.input);
        this.input?.addEventListener("keydown", handlers.keydown);
        this.input?.addEventListener("blur", handlers.blur);
        this.createButton?.addEventListener("mousedown", handlers.create);
        this.optionSlot?.addEventListener("slotchange", handlers.options);
    }

    disconnect(handlers: TokenInputHandlers): void {
        this.input?.removeEventListener("focus", handlers.focus);
        this.input?.removeEventListener("input", handlers.input);
        this.input?.removeEventListener("keydown", handlers.keydown);
        this.input?.removeEventListener("blur", handlers.blur);
        this.createButton?.removeEventListener("mousedown", handlers.create);
        this.optionSlot?.removeEventListener("slotchange", handlers.options);
    }

    syncAttributes(host: HTMLElement, disabled: boolean, selectedCount: number): void {
        if (this.label) {
            const label = host.getAttribute("label") ?? "";
            this.label.textContent = label;
            this.label.hidden = label === "";
        }
        if (this.input) {
            this.input.placeholder = selectedCount ? "" : (host.getAttribute("placeholder") ?? "");
            this.input.disabled = disabled;
        }
        if (this.createButton) {
            this.createButton.hidden = !host.hasAttribute("creatable");
        }
    }

    syncDisplay(value: string, selected: string[], options: ComboOption[], onRemove: (value: string) => void): void {
        this.tokens?.replaceChildren(...tokenLabels(selected, options).map((item) => tokenElement(item, onRemove)));
        this.internals.setFormValue(value);
    }

    renderList(
        items: ComboItem[],
        activeIndex: number,
        onSelect: (item: ComboItem) => void,
        emptyState: HTMLElement,
    ): void {
        if (!this.listbox) {
            return;
        }
        this.listbox.replaceChildren(
            ...items.map((item, index) => renderComboItem(item, index, activeIndex, "", onSelect)),
        );
        if (items.length === 0) {
            this.listbox.append(emptyState);
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
