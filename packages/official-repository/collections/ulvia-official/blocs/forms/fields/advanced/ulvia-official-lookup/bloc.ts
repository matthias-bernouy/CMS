import { Component } from "@bernouy/cms-content/browser";
import template from "./shadowdom.html" with { type: "text" };
import css from "./style.css" with { type: "text" };

let nextListboxId = 0;

export class Bloc extends Component {
    private select: HTMLSelectElement | null = null;
    private input: HTMLInputElement | null;
    private listbox: HTMLElement | null;
    private popover: HTMLElement | null;
    private empty: HTMLElement | null;
    private chips: HTMLElement | null;
    private clearButton: HTMLButtonElement | null;
    private filteredOptions: HTMLOptionElement[] = [];
    private activeIndex = 0;
    private sourceAriaHidden: string | null = null;
    private sourceTabIndex: string | null = null;
    private sourcePrepared = false;
    private observer = new MutationObserver(() => this.syncSelection());
    private root: Document | ShadowRoot | null = null;

    static get observedAttributes(): string[] {
        return ["placeholder", "no-results-label", "clear-label", "remove-label"];
    }

    constructor() {
        super({ css, template });
        this.input = document.createElement("input");
        this.input.type = "text";
        this.input.autocomplete = "off";
        this.input.setAttribute("part", "input");
        this.input.setAttribute("role", "combobox");
        this.input.setAttribute("aria-autocomplete", "list");
        this.shadowRoot?.querySelector('[part="query"]')?.append(this.input);
        this.listbox = this.shadowRoot?.querySelector('[part="listbox"]') ?? null;
        this.popover = this.shadowRoot?.querySelector('[part="popover"]') ?? null;
        this.empty = this.shadowRoot?.querySelector('[part="empty"]') ?? null;
        this.chips = this.shadowRoot?.querySelector('[part="chips"]') ?? null;
        this.clearButton = document.createElement("button");
        this.clearButton.type = "button";
        this.clearButton.hidden = true;
        this.clearButton.setAttribute("part", "clear");
        this.shadowRoot?.querySelector('[part="clear-shell"]')?.append(this.clearButton);
    }

    override connectedCallback(): void {
        this.select = this.querySelector<HTMLSelectElement>(":scope > select");
        this.input?.addEventListener("input", this.handleInput);
        this.input?.addEventListener("focus", this.open);
        this.input?.addEventListener("keydown", this.handleKeydown);
        this.listbox?.addEventListener("click", this.handleOptionClick);
        this.chips?.addEventListener("click", this.handleChipClick);
        this.clearButton?.addEventListener("click", this.clear);
        this.select?.addEventListener("change", this.syncSelection);
        this.select?.addEventListener("focus", this.redirectFocus);
        document.addEventListener("pointerdown", this.closeFromOutside);
        this.root = this.getRootNode() as Document | ShadowRoot;
        this.root.addEventListener("reset", this.handleReset);
        if (this.select) {
            this.hideSourceFromAccessibilityTree();
            this.observer.observe(this.select, { attributes: true, childList: true, subtree: true });
        }
        this.prepareAccessibility();
        this.syncSelection();
    }

    disconnectedCallback(): void {
        this.input?.removeEventListener("input", this.handleInput);
        this.input?.removeEventListener("focus", this.open);
        this.input?.removeEventListener("keydown", this.handleKeydown);
        this.listbox?.removeEventListener("click", this.handleOptionClick);
        this.chips?.removeEventListener("click", this.handleChipClick);
        this.clearButton?.removeEventListener("click", this.clear);
        this.select?.removeEventListener("change", this.syncSelection);
        this.select?.removeEventListener("focus", this.redirectFocus);
        document.removeEventListener("pointerdown", this.closeFromOutside);
        this.root?.removeEventListener("reset", this.handleReset);
        this.root = null;
        this.observer.disconnect();
        this.restoreSourceAccessibility();
    }

    attributeChangedCallback(): void {
        this.prepareAccessibility();
        this.render();
    }

    private prepareAccessibility(): void {
        if (!this.input || !this.listbox || !this.clearButton) {
            return;
        }
        this.listbox.id ||= `ulvia-lookup-${++nextListboxId}`;
        this.input.setAttribute("aria-controls", this.listbox.id);
        this.input.setAttribute("aria-expanded", this.input.getAttribute("aria-expanded") || "false");
        this.input.setAttribute("aria-haspopup", "listbox");
        this.input.setAttribute("aria-label", this.accessibleName());
        this.input.placeholder = this.getAttribute("placeholder") || "Search options";
        this.clearButton.setAttribute("aria-label", this.getAttribute("clear-label") || "Clear selection");
        this.listbox.setAttribute("aria-multiselectable", String(this.select?.multiple ?? false));
    }

    private handleInput = (): void => {
        this.activeIndex = 0;
        this.render();
        this.setOpen(true);
    };

    private open = (): void => {
        this.render();
        this.setOpen(true);
    };

    private handleKeydown = (event: KeyboardEvent): void => {
        if (event.key === "ArrowDown" || event.key === "ArrowUp") {
            const direction = event.key === "ArrowDown" ? 1 : -1;
            this.activeIndex = Math.min(
                Math.max(0, this.filteredOptions.length - 1),
                Math.max(0, this.activeIndex + direction),
            );
            this.setOpen(true);
            this.render();
            event.preventDefault();
        } else if (event.key === "Enter" && !this.popover?.hasAttribute("hidden")) {
            const option = this.filteredOptions[this.activeIndex];
            if (option) {
                this.selectOption(option);
                event.preventDefault();
            }
        } else if (event.key === "Escape") {
            this.setOpen(false);
        } else if (event.key === "Backspace" && this.select?.multiple && !this.input?.value) {
            const selected = Array.from(this.select.selectedOptions).filter((option) => option.value);
            const lastOption = selected.at(-1);
            if (lastOption) {
                this.setOptionSelected(lastOption, false);
                event.preventDefault();
            }
        }
    };

    private handleOptionClick = (event: Event): void => {
        const button =
            event.target instanceof Element ? event.target.closest<HTMLButtonElement>("button[data-value]") : null;
        const option = button
            ? Array.from(this.select?.options ?? []).find((item) => item.value === button.dataset.value)
            : null;
        if (option) {
            this.selectOption(option);
        }
    };

    private selectOption(option: HTMLOptionElement): void {
        if (!this.select || !this.input) {
            return;
        }
        if (this.select.multiple) {
            option.selected = !option.selected;
            this.input.value = "";
        } else {
            this.select.value = option.value;
            this.input.value = option.text;
        }
        this.dispatchSelectionEvents();
        this.render();
        this.setOpen(this.select.multiple);
        this.input.focus();
    }

    private handleChipClick = (event: Event): void => {
        const button =
            event.target instanceof Element
                ? event.target.closest<HTMLButtonElement>("button[data-remove-value]")
                : null;
        const option = button
            ? Array.from(this.select?.options ?? []).find((item) => item.value === button.dataset.removeValue)
            : null;
        if (option && !this.select?.disabled) {
            this.setOptionSelected(option, false);
            this.input?.focus();
        }
    };

    private clear = (): void => {
        if (!this.select || !this.input || this.select.disabled) {
            return;
        }
        if (this.select.multiple) {
            for (const option of Array.from(this.select.options)) {
                option.selected = false;
            }
        } else {
            this.select.value = "";
        }
        this.input.value = "";
        this.dispatchSelectionEvents();
        this.render();
        this.input.focus();
    };

    private syncSelection = (): void => {
        if (!this.select || !this.input) {
            return;
        }
        const selected = Array.from(this.select.selectedOptions).filter((option) => option.value);
        if (!this.select.multiple) {
            this.input.value = selected[0]?.text ?? "";
        }
        this.input.disabled = this.select.disabled;
        this.toggleAttribute("data-disabled", this.select.disabled);
        this.clearButton?.toggleAttribute("hidden", selected.length === 0 || this.select.disabled);
        this.prepareAccessibility();
        this.render();
    };

    private render(): void {
        if (!this.select || !this.input || !this.listbox || !this.empty) {
            return;
        }
        const query = this.input.value.trim().toLocaleLowerCase();
        const selectedText = this.select.multiple
            ? null
            : this.select.selectedOptions.item(0)?.text.toLocaleLowerCase();
        const effectiveQuery = query === selectedText ? "" : query;
        this.filteredOptions = Array.from(this.select.options).filter(
            (option) => option.value && !option.disabled && option.text.toLocaleLowerCase().includes(effectiveQuery),
        );
        this.activeIndex = Math.min(this.activeIndex, Math.max(0, this.filteredOptions.length - 1));
        this.listbox.replaceChildren(
            ...this.filteredOptions.map((option, index) => {
                const button = document.createElement("button");
                button.type = "button";
                button.textContent = option.text;
                button.dataset.value = option.value;
                button.id = `${this.listbox.id}-option-${index}`;
                button.setAttribute("part", "option");
                button.setAttribute("role", "option");
                button.tabIndex = -1;
                button.setAttribute("aria-selected", String(option.selected));
                button.toggleAttribute("data-active", index === this.activeIndex);
                return button;
            }),
        );
        this.empty.textContent = this.getAttribute("no-results-label") || "No matching options";
        this.empty.toggleAttribute("hidden", this.filteredOptions.length > 0);
        const activeOption = this.listbox.querySelector<HTMLElement>(`#${this.listbox.id}-option-${this.activeIndex}`);
        if (activeOption) {
            this.input.setAttribute("aria-activedescendant", activeOption.id);
        } else {
            this.input.removeAttribute("aria-activedescendant");
        }
        this.renderChips();
        const selectedCount = Array.from(this.select.selectedOptions).filter((option) => option.value).length;
        this.clearButton?.toggleAttribute("hidden", selectedCount === 0 || this.select.disabled);
    }

    private renderChips(): void {
        if (!this.select || !this.chips) {
            return;
        }
        const selected = this.select.multiple
            ? Array.from(this.select.selectedOptions).filter((option) => option.value)
            : [];
        const removeLabel = this.getAttribute("remove-label") || "Remove";
        this.chips.replaceChildren(
            ...selected.map((option) => {
                const chip = document.createElement("span");
                chip.setAttribute("part", "chip");
                chip.setAttribute("role", "listitem");
                const label = document.createElement("span");
                label.textContent = option.text;
                const remove = document.createElement("button");
                remove.type = "button";
                remove.dataset.removeValue = option.value;
                remove.setAttribute("part", "chip-remove");
                remove.setAttribute("aria-label", `${removeLabel} ${option.text}`);
                remove.disabled = this.select?.disabled ?? false;
                chip.append(label, remove);
                return chip;
            }),
        );
        this.chips.toggleAttribute("hidden", selected.length === 0);
        this.toggleAttribute("data-multiple", this.select.multiple);
    }

    private setOptionSelected(option: HTMLOptionElement, selected: boolean): void {
        option.selected = selected;
        this.dispatchSelectionEvents();
        this.render();
    }

    private dispatchSelectionEvents(): void {
        this.select?.dispatchEvent(new Event("input", { bubbles: true, composed: true }));
        this.select?.dispatchEvent(new Event("change", { bubbles: true, composed: true }));
    }

    private setOpen(open: boolean): void {
        const nextOpen = open && !this.select?.disabled;
        this.popover?.toggleAttribute("hidden", !nextOpen);
        this.input?.setAttribute("aria-expanded", String(nextOpen));
    }

    private closeFromOutside = (event: Event): void => {
        if (event.target instanceof Node && !this.contains(event.target) && !this.shadowRoot?.contains(event.target)) {
            this.setOpen(false);
        }
    };

    private redirectFocus = (): void => {
        this.input?.focus();
    };

    private handleReset = (event: Event): void => {
        if (event.target !== this.select?.form) {
            return;
        }
        window.setTimeout(() => {
            if (this.input) {
                this.input.value = "";
            }
            this.syncSelection();
        });
    };

    private accessibleName(): string {
        return (
            this.select?.getAttribute("aria-label")?.trim() ||
            this.select?.labels?.item(0)?.textContent?.trim() ||
            this.getAttribute("placeholder") ||
            "Search options"
        );
    }

    private hideSourceFromAccessibilityTree(): void {
        if (!this.select || this.sourcePrepared) {
            return;
        }
        this.sourceAriaHidden = this.select.getAttribute("aria-hidden");
        this.sourceTabIndex = this.select.getAttribute("tabindex");
        this.select.setAttribute("aria-hidden", "true");
        this.select.tabIndex = -1;
        this.sourcePrepared = true;
    }

    private restoreSourceAccessibility(): void {
        if (!this.select || !this.sourcePrepared) {
            return;
        }
        if (this.sourceAriaHidden === null) {
            this.select.removeAttribute("aria-hidden");
        } else {
            this.select.setAttribute("aria-hidden", this.sourceAriaHidden);
        }
        if (this.sourceTabIndex === null) {
            this.select.removeAttribute("tabindex");
        } else {
            this.select.setAttribute("tabindex", this.sourceTabIndex);
        }
        this.sourcePrepared = false;
    }
}
