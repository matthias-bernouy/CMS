import { Component } from "@bernouy/cms-content/browser";
import template from "./shadowdom.html" with { type: "text" };
import css from "./style.css" with { type: "text" };

let nextListboxId = 0;

function labelFor(select: HTMLSelectElement): string {
    return (
        select.getAttribute("aria-label")?.trim() ||
        Array.from(select.labels ?? [])
            .map((label) => label.textContent?.replace(/\s+/g, " ").trim())
            .find(Boolean) ||
        "Select an option"
    );
}

export class Bloc extends Component {
    private select: HTMLSelectElement | null = null;
    private trigger: HTMLButtonElement;
    private value: HTMLElement;
    private listbox: HTMLElement | null;
    private popover: HTMLElement | null;
    private activeIndex = 0;
    private sourceTabIndex: string | null = null;
    private sourceAriaHidden: string | null = null;
    private observer = new MutationObserver(() => this.sync());

    constructor() {
        super({ css, template });
        this.trigger = document.createElement("button");
        this.trigger.type = "button";
        this.trigger.setAttribute("part", "trigger");
        this.trigger.setAttribute("role", "combobox");
        this.trigger.setAttribute("aria-haspopup", "listbox");
        this.value = document.createElement("span");
        this.value.setAttribute("part", "value");
        const indicator = document.createElement("span");
        indicator.setAttribute("part", "indicator");
        indicator.setAttribute("aria-hidden", "true");
        this.trigger.append(this.value, indicator);
        this.shadowRoot?.querySelector('[part="trigger-shell"]')?.append(this.trigger);
        this.listbox = this.shadowRoot?.querySelector('[part="listbox"]') ?? null;
        this.popover = this.shadowRoot?.querySelector('[part="popover"]') ?? null;
    }

    override connectedCallback(): void {
        this.trigger.addEventListener("click", this.toggle);
        this.trigger.addEventListener("keydown", this.handleKeydown);
        this.listbox?.addEventListener("click", this.handleOptionClick);
        this.ownerDocument.addEventListener("pointerdown", this.closeFromOutside);
        this.ownerDocument.addEventListener("reset", this.handleReset);
        this.bindSelect();
    }

    disconnectedCallback(): void {
        this.trigger.removeEventListener("click", this.toggle);
        this.trigger.removeEventListener("keydown", this.handleKeydown);
        this.listbox?.removeEventListener("click", this.handleOptionClick);
        this.ownerDocument.removeEventListener("pointerdown", this.closeFromOutside);
        this.ownerDocument.removeEventListener("reset", this.handleReset);
        this.select?.removeEventListener("change", this.sync);
        this.select?.removeEventListener("invalid", this.handleInvalid);
        this.select?.removeEventListener("focus", this.redirectFocus);
        this.select?.removeEventListener("click", this.openFromSource);
        this.observer.disconnect();
        this.restoreSource();
    }

    private bindSelect(): void {
        this.select = this.querySelector<HTMLSelectElement>(":scope > select:not([multiple])");
        if (!this.select || !this.listbox) {
            return;
        }
        this.sourceTabIndex = this.select.getAttribute("tabindex");
        this.sourceAriaHidden = this.select.getAttribute("aria-hidden");
        this.select.setAttribute("aria-hidden", "true");
        this.select.tabIndex = -1;
        this.select.addEventListener("change", this.sync);
        this.select.addEventListener("invalid", this.handleInvalid);
        this.select.addEventListener("focus", this.redirectFocus);
        this.select.addEventListener("click", this.openFromSource);
        this.observer.observe(this.select, { attributes: true, childList: true, subtree: true });
        this.listbox.id ||= `ulvia-select-${++nextListboxId}`;
        this.trigger.setAttribute("aria-controls", this.listbox.id);
        this.toggleAttribute("data-ready", true);
        this.sync();
    }

    private sync = (): void => {
        if (!this.select || !this.listbox) {
            return;
        }
        this.activeIndex = Math.max(0, this.select.selectedIndex);
        const selected = this.select.options.item(this.select.selectedIndex);
        this.value.textContent = selected?.text || "Select an option";
        this.trigger.disabled = this.select.disabled;
        this.trigger.setAttribute("aria-label", labelFor(this.select));
        this.trigger.setAttribute("aria-expanded", String(!this.popover?.hasAttribute("hidden")));
        this.trigger.setAttribute("aria-required", String(this.select.required));
        const invalid = this.select.matches(":user-invalid") || this.select.getAttribute("aria-invalid") === "true";
        this.trigger.setAttribute("aria-invalid", String(invalid));
        this.listbox.replaceChildren(
            ...Array.from(this.select.options).map((option, index) => {
                const item = document.createElement("button");
                item.type = "button";
                item.textContent = option.text;
                item.dataset.index = String(index);
                item.id = `${this.listbox?.id}-option-${index}`;
                item.setAttribute("part", "option");
                item.setAttribute("role", "option");
                item.setAttribute("aria-selected", String(option.selected));
                item.toggleAttribute("data-active", index === this.activeIndex);
                item.disabled = option.disabled;
                item.tabIndex = -1;
                return item;
            }),
        );
        this.trigger.setAttribute("aria-activedescendant", `${this.listbox.id}-option-${this.activeIndex}`);
        this.toggleAttribute("data-disabled", this.select.disabled);
        this.toggleAttribute("data-invalid", invalid);
    };

    private toggle = (): void => {
        this.setOpen(this.popover?.hasAttribute("hidden") === true);
    };

    private setOpen(open: boolean): void {
        const nextOpen = open && !this.select?.disabled;
        this.popover?.toggleAttribute("hidden", !nextOpen);
        this.trigger.setAttribute("aria-expanded", String(nextOpen));
        this.toggleAttribute("data-open", nextOpen);
    }

    private handleKeydown = (event: KeyboardEvent): void => {
        if (event.key === "ArrowDown" || event.key === "ArrowUp") {
            this.moveActive(event.key === "ArrowDown" ? 1 : -1);
            this.setOpen(true);
        } else if (event.key === "Home") {
            this.activeIndex = this.findEnabled(0, 1);
        } else if (event.key === "End") {
            this.activeIndex = this.findEnabled((this.select?.options.length ?? 1) - 1, -1);
        } else if ((event.key === "Enter" || event.key === " ") && !this.popover?.hasAttribute("hidden")) {
            this.selectIndex(this.activeIndex);
        } else if (event.key === "Escape") {
            this.setOpen(false);
        } else {
            return;
        }
        event.preventDefault();
        this.renderActiveOption();
    };

    private moveActive(direction: -1 | 1): void {
        const last = Math.max(0, (this.select?.options.length ?? 1) - 1);
        this.activeIndex = this.findEnabled(Math.min(last, Math.max(0, this.activeIndex + direction)), direction);
    }

    private findEnabled(start: number, direction: -1 | 1): number {
        const options = this.select?.options;
        if (!options?.length) {
            return 0;
        }
        for (let index = start; index >= 0 && index < options.length; index += direction) {
            if (!options.item(index)?.disabled) {
                return index;
            }
        }
        return this.activeIndex;
    }

    private renderActiveOption(): void {
        this.listbox?.querySelectorAll<HTMLElement>("[data-index]").forEach((item) => {
            item.toggleAttribute("data-active", Number(item.dataset.index) === this.activeIndex);
        });
        if (this.listbox) {
            this.trigger.setAttribute("aria-activedescendant", `${this.listbox.id}-option-${this.activeIndex}`);
        }
    }

    private handleOptionClick = (event: Event): void => {
        const item = event.target instanceof Element ? event.target.closest<HTMLElement>("[data-index]") : null;
        if (item) {
            this.selectIndex(Number(item.dataset.index));
        }
    };

    private selectIndex(index: number): void {
        const option = this.select?.options.item(index);
        if (!this.select || !option || option.disabled) {
            return;
        }
        this.select.selectedIndex = index;
        this.select.dispatchEvent(new Event("input", { bubbles: true, composed: true }));
        this.select.dispatchEvent(new Event("change", { bubbles: true, composed: true }));
        this.setOpen(false);
        this.trigger.focus();
    }

    private handleInvalid = (event: Event): void => {
        event.preventDefault();
        this.toggleAttribute("data-invalid", true);
        this.trigger.focus();
    };

    private redirectFocus = (): void => this.trigger.focus();
    private openFromSource = (event: Event): void => {
        event.preventDefault();
        this.trigger.focus();
        this.setOpen(true);
    };

    private closeFromOutside = (event: Event): void => {
        if (event.target instanceof Node && !this.contains(event.target) && !this.shadowRoot?.contains(event.target)) {
            this.setOpen(false);
        }
    };

    private handleReset = (event: Event): void => {
        if (event.target === this.select?.form) {
            window.setTimeout(this.sync);
        }
    };

    private restoreSource(): void {
        if (!this.select) {
            return;
        }
        this.sourceTabIndex === null
            ? this.select.removeAttribute("tabindex")
            : this.select.setAttribute("tabindex", this.sourceTabIndex);
        this.sourceAriaHidden === null
            ? this.select.removeAttribute("aria-hidden")
            : this.select.setAttribute("aria-hidden", this.sourceAriaHidden);
    }
}
