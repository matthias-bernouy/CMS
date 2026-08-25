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
    private readonly labelRow: HTMLElement | null;
    private readonly label: HTMLElement | null;
    private readonly hint: HTMLElement | null;
    private readonly tokens: HTMLElement | null;
    private readonly listbox: HTMLElement | null;
    private readonly createButton: HTMLButtonElement | null;

    constructor(
        root: ShadowRoot | null,
        private readonly internals: ElementInternals,
    ) {
        this.input = root?.querySelector("input") ?? null;
        this.labelRow = root?.querySelector(".label-row") ?? null;
        this.label = root?.querySelector(".label") ?? null;
        this.hint = root?.querySelector(".hint") ?? null;
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

    syncAttributes(host: HTMLElement, disabled: boolean, selectedCount: number, showCreateAction = false): void {
        const label = host.getAttribute("label") ?? "";
        if (this.label) {
            this.label.textContent = label;
            this.label.hidden = label === "";
        }
        if (this.input) {
            this.input.placeholder = selectedCount ? "" : (host.getAttribute("placeholder") ?? "");
            this.input.disabled = disabled;
            syncOptionalAttribute(this.input, "aria-label", host.getAttribute("aria-label"));
            syncBooleanAria(this.input, "aria-required", host.hasAttribute("required"));
        }
        if (this.hint) {
            const hint = host.getAttribute("hint") ?? "";
            this.hint.textContent = hint;
            this.hint.dataset.level = host.getAttribute("hint-level") ?? "info";
            this.hint.hidden = hint === "";
            if (this.input) {
                syncOptionalAttribute(this.input, "aria-describedby", hint ? this.hint.id : null);
            }
        }
        if (this.createButton) {
            this.createButton.hidden = !showCreateAction;
        }
        if (this.labelRow) {
            this.labelRow.hidden = label === "" && !showCreateAction;
        }
    }

    syncDisplay(value: string, selected: string[], options: ComboOption[], onRemove: (value: string) => void): void {
        this.tokens?.replaceChildren(...tokenLabels(selected, options).map((item) => tokenElement(item, onRemove)));
        this.internals.setFormValue(value);
    }

    syncValidity(host: HTMLElement, selectedCount: number, showMessage: boolean): void {
        if (!this.input) {
            return;
        }
        const valueMissing = host.hasAttribute("required") && selectedCount === 0;
        if (valueMissing) {
            this.internals.setValidity({ valueMissing: true }, "Please add at least one value.", this.input);
        } else {
            this.internals.setValidity({});
        }
        const invalid = host.hasAttribute("invalid") || (showMessage && valueMissing);
        syncBooleanAria(this.input, "aria-invalid", invalid);
        this.syncHint(host, showMessage && valueMissing);
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
        if (activeIndex >= 0) {
            this.input?.setAttribute("aria-activedescendant", `option-${activeIndex}`);
        } else {
            this.input?.removeAttribute("aria-activedescendant");
        }
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

    private syncHint(host: HTMLElement, showValidationMessage: boolean): void {
        if (!this.hint || !this.input) {
            return;
        }
        const hint = showValidationMessage ? "Please add at least one value." : (host.getAttribute("hint") ?? "");
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

function syncBooleanAria(element: HTMLElement, name: "aria-invalid" | "aria-required", value: boolean): void {
    if (value) {
        element.setAttribute(name, "true");
    } else {
        element.removeAttribute(name);
    }
}
