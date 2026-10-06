import { Component } from "@bernouy/cms-content/browser";
import template from "./shadowdom.html" with { type: "text" };
import css from "./style.css" with { type: "text" };

let nextListboxId = 0;

function resolveSelectLabel(select: HTMLSelectElement, ownerDocument: Document): string {
    const explicit = select.getAttribute("aria-label")?.trim();
    if (explicit) {
        return explicit;
    }
    const labelledBy = select.getAttribute("aria-labelledby")?.trim();
    if (labelledBy) {
        const referenced = labelledBy
            .split(/\s+/)
            .map((id) => ownerDocument.getElementById(id)?.textContent?.trim())
            .filter(Boolean)
            .join(" ");
        if (referenced) {
            return referenced;
        }
    }
    for (const label of Array.from(select.labels ?? [])) {
        const clone = label.cloneNode(true) as HTMLLabelElement;
        clone.querySelectorAll("button, input, select, textarea").forEach((control) => control.remove());
        const text = clone.textContent?.replace(/\s+/g, " ").trim();
        if (text) {
            return text;
        }
    }
    return "Select options";
}

function copySelectAttribute(select: HTMLSelectElement, target: HTMLElement, name: string): void {
    const value = select.getAttribute(name);
    if (value) {
        target.setAttribute(name, value);
    } else {
        target.removeAttribute(name);
    }
}

function restoreAttribute(element: HTMLElement, name: string, value: string | null): void {
    if (value === null) {
        element.removeAttribute(name);
        return;
    }
    element.setAttribute(name, value);
}

export class Bloc extends Component {
    private select: HTMLSelectElement | null = null;
    private listbox: HTMLElement | null;
    private activeIndex = 0;
    private selectWasHidden = false;
    private selectTabIndex: string | null = null;
    private selectAriaHidden: string | null = null;
    private root: Document | ShadowRoot | null = null;
    private observer = new MutationObserver(() => this.renderOptions());

    constructor() {
        super({ css, template });
        this.listbox = this.shadowRoot?.querySelector('[part="listbox"]') ?? null;
    }

    override connectedCallback(): void {
        this.shadowRoot?.addEventListener("click", this.handleClick);
        this.listbox?.addEventListener("keydown", this.handleKeydown);
        this.root = this.getRootNode() as Document | ShadowRoot;
        this.root.addEventListener("reset", this.queueRender);
        this.bindSelect();
    }

    disconnectedCallback(): void {
        this.shadowRoot?.removeEventListener("click", this.handleClick);
        this.listbox?.removeEventListener("keydown", this.handleKeydown);
        this.root?.removeEventListener("reset", this.queueRender);
        this.root = null;
        this.select?.removeEventListener("change", this.renderOptions);
        this.select?.removeEventListener("invalid", this.handleInvalid);
        this.observer.disconnect();
        if (this.select) {
            this.select.hidden = this.selectWasHidden;
            restoreAttribute(this.select, "tabindex", this.selectTabIndex);
            restoreAttribute(this.select, "aria-hidden", this.selectAriaHidden);
        }
    }

    private bindSelect(): void {
        this.select = this.querySelector<HTMLSelectElement>(":scope > select[multiple]");
        if (!this.select || !this.listbox) {
            return;
        }
        this.selectWasHidden = this.select.hidden;
        this.selectTabIndex = this.select.getAttribute("tabindex");
        this.selectAriaHidden = this.select.getAttribute("aria-hidden");
        this.select.setAttribute("aria-hidden", "true");
        this.select.tabIndex = -1;
        this.select.hidden = true;
        this.select.addEventListener("change", this.renderOptions);
        this.select.addEventListener("invalid", this.handleInvalid);
        this.observer.observe(this.select, { attributes: true, childList: true, subtree: true });
        this.listbox.id ||= `ulvia-multi-select-${++nextListboxId}`;
        this.toggleAttribute("data-ready", true);
        this.renderOptions();
    }

    private renderOptions = (): void => {
        if (!this.select || !this.listbox) {
            return;
        }
        const options = Array.from(this.select.options);
        this.activeIndex = Math.min(this.activeIndex, Math.max(0, options.length - 1));
        if (options[this.activeIndex]?.disabled) {
            this.activeIndex = options.findIndex((option) => !option.disabled);
        }
        this.activeIndex = Math.max(0, this.activeIndex);
        this.listbox.replaceChildren(
            ...options.map((option, index) => {
                const item = document.createElement("button");
                item.type = "button";
                item.id = `${this.listbox?.id}-option-${index}`;
                item.textContent = option.text;
                item.dataset.index = String(index);
                item.setAttribute("part", "option");
                item.setAttribute("role", "option");
                item.setAttribute("aria-selected", String(option.selected));
                item.tabIndex = -1;
                item.toggleAttribute("data-active", index === this.activeIndex);
                item.disabled = option.disabled || this.select?.disabled === true;
                return item;
            }),
        );
        this.listbox.setAttribute("aria-activedescendant", `${this.listbox.id}-option-${this.activeIndex}`);
        this.listbox.setAttribute("aria-label", resolveSelectLabel(this.select, this.ownerDocument));
        copySelectAttribute(this.select, this.listbox, "aria-describedby");
        this.listbox.setAttribute("aria-disabled", String(this.select.disabled));
        this.listbox.setAttribute("aria-required", String(this.select.required));
        this.listbox.setAttribute(
            "aria-invalid",
            String(this.select.matches(":user-invalid") || this.select.getAttribute("aria-invalid") === "true"),
        );
        this.listbox.tabIndex = this.select.disabled ? -1 : 0;
        this.toggleAttribute("data-disabled", this.select.disabled);
        this.toggleAttribute(
            "data-invalid",
            this.select.matches(":user-invalid") || this.select.getAttribute("aria-invalid") === "true",
        );
    };

    private handleClick = (event: Event): void => {
        const item =
            event.target instanceof Element ? event.target.closest<HTMLButtonElement>("button[data-index]") : null;
        if (item) {
            this.toggleOption(Number(item.dataset.index));
        }
    };

    private handleKeydown = (event: KeyboardEvent): void => {
        const lastIndex = Math.max(0, (this.select?.options.length ?? 1) - 1);
        if (event.key === "ArrowRight" || event.key === "ArrowDown") {
            this.moveActive(1);
        } else if (event.key === "ArrowLeft" || event.key === "ArrowUp") {
            this.moveActive(-1);
        } else if (event.key === "Home") {
            this.activeIndex = this.findEnabledIndex(0, 1);
        } else if (event.key === "End") {
            this.activeIndex = this.findEnabledIndex(lastIndex, -1);
        } else if (event.key === " " || event.key === "Enter") {
            this.toggleOption(this.activeIndex);
        } else {
            return;
        }
        event.preventDefault();
        this.renderOptions();
    };

    private moveActive(direction: -1 | 1): void {
        const lastIndex = Math.max(0, (this.select?.options.length ?? 1) - 1);
        const candidate = Math.min(lastIndex, Math.max(0, this.activeIndex + direction));
        this.activeIndex = this.findEnabledIndex(candidate, direction);
    }

    private findEnabledIndex(start: number, direction: -1 | 1): number {
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

    private toggleOption(index: number): void {
        const option = this.select?.options.item(index);
        if (!option || option.disabled || this.select?.disabled) {
            return;
        }
        this.activeIndex = index;
        option.selected = !option.selected;
        this.select.dispatchEvent(new Event("input", { bubbles: true, composed: true }));
        this.select.dispatchEvent(new Event("change", { bubbles: true, composed: true }));
    }

    private handleInvalid = (event: Event): void => {
        event.preventDefault();
        this.toggleAttribute("data-invalid", true);
        this.listbox?.focus();
    };

    private queueRender = (): void => {
        window.setTimeout(this.renderOptions);
    };
}
