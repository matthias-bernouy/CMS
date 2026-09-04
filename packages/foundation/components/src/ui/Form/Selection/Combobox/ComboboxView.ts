import { emptyItem, renderComboItem, statusItem } from "./list";
import { ComboListPopover } from "./listPopover";
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
    private readonly control: HTMLElement | null;
    private readonly listbox: HTMLElement | null;
    private readonly hint: HTMLElement | null;
    private readonly clearButton: HTMLButtonElement | null;
    private readonly chevron: SVGElement | null;
    private readonly listPopover: ComboListPopover | null;

    constructor(
        root: ShadowRoot | null,
        private readonly internals: ElementInternals,
    ) {
        this.input = root?.querySelector("input") ?? null;
        this.label = root?.querySelector(".label") ?? null;
        this.control = root?.querySelector(".control") ?? null;
        this.listbox = root?.querySelector("[role='listbox']") ?? null;
        this.hint = root?.querySelector(".hint") ?? null;
        this.clearButton = root?.querySelector("[data-clear]") ?? null;
        this.chevron = root?.querySelector(".chevron") ?? null;
        this.optionSlot = root?.querySelector("slot") ?? null;
        this.listPopover = this.control && this.listbox ? new ComboListPopover(this.control, this.listbox) : null;
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
        this.hideList();
    }

    syncAttributes(host: HTMLElement, disabled: boolean): void {
        if (this.label) {
            const label = host.getAttribute("label") ?? "";
            this.label.textContent = label;
            this.label.hidden = label === "";
        }
        if (this.input) {
            this.input.placeholder = host.getAttribute("placeholder") ?? "";
            syncOptionalAttribute(this.input, "aria-label", host.getAttribute("aria-label"));
            this.input.disabled = disabled;
            this.input.required = host.hasAttribute("required");
            syncBooleanAria(this.input, "aria-required", host.hasAttribute("required"));
        }
        if (this.hint) {
            const hint = host.getAttribute("hint") ?? "";
            this.hint.textContent = hint;
            this.hint.dataset.level = host.getAttribute("hint-level") ?? "info";
            this.hint.hidden = hint === "";
            if (this.input) {
                if (hint) {
                    this.input.setAttribute("aria-describedby", this.hint.id);
                } else {
                    this.input.removeAttribute("aria-describedby");
                }
            }
        }
    }

    syncDisplay(selectedValue: string, selectedLabel: string): void {
        if (this.input && !this.input.matches(":focus")) {
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

    syncValidity(host: HTMLElement, selectedValue: string, showMessage: boolean): void {
        if (!this.input) {
            return;
        }
        const valueMissing = host.hasAttribute("required") && selectedValue === "";
        if (valueMissing) {
            this.internals.setValidity({ valueMissing: true }, "Please select a value.", this.input);
        } else {
            this.internals.setValidity({});
        }
        const invalid = host.hasAttribute("invalid") || (showMessage && valueMissing);
        syncBooleanAria(this.input, "aria-invalid", invalid);
        this.syncHint(host, showMessage && valueMissing);
    }

    syncClearButtonForInput(): void {
        if (this.clearButton) {
            this.clearButton.hidden = this.input?.value === "";
        }
    }

    renderList(
        items: ComboItem[],
        activeIndex: number,
        selectedValue: string,
        onSelect: (item: ComboItem) => void,
        remote: { loading: boolean; hasMore: boolean; loadMore: () => void } | null = null,
    ): void {
        if (!this.listbox) {
            return;
        }
        this.listbox.replaceChildren(
            ...items.map((item, index) => renderComboItem(item, index, activeIndex, selectedValue, onSelect)),
        );
        if (items.length === 0 && !remote?.loading) {
            this.listbox.append(emptyItem());
        }
        if (remote?.loading) {
            this.listbox.append(statusItem("Loading…", "loading"));
        } else if (remote?.hasMore) {
            this.listbox.append(statusItem("Load more", "load-more", remote.loadMore));
        }
        this.listPopover?.show();
        this.input?.setAttribute("aria-expanded", "true");
    }

    hideList(): void {
        if (this.listbox) {
            this.listPopover?.hide();
        }
        this.input?.setAttribute("aria-expanded", "false");
        this.input?.removeAttribute("aria-activedescendant");
    }

    get listHidden(): boolean {
        return this.listbox?.hidden ?? true;
    }

    private syncHint(host: HTMLElement, showValidationMessage: boolean): void {
        if (!this.hint || !this.input) {
            return;
        }
        const hint = showValidationMessage ? "Please select a value." : (host.getAttribute("hint") ?? "");
        this.hint.textContent = hint;
        this.hint.dataset.level = showValidationMessage ? "error" : (host.getAttribute("hint-level") ?? "info");
        this.hint.hidden = hint === "";
        syncOptionalAttribute(this.input, "aria-describedby", hint ? this.hint.id : null);
    }
}

function syncOptionalAttribute(element: HTMLElement, name: string, value: string | null): void {
    if (value) {
        element.setAttribute(name, value);
    } else {
        element.removeAttribute(name);
    }
}

function syncBooleanAria(input: HTMLInputElement, name: "aria-invalid" | "aria-required", value: boolean): void {
    if (value) {
        input.setAttribute(name, "true");
    } else {
        input.removeAttribute(name);
    }
}
