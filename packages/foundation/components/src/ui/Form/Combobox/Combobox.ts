import { Component, upgradeProperty } from "@bernouy/components/base";
import template from "./template.html" with { type: "text" };
import baseCss from "./base.css" with { type: "text" };
import listCss from "./list.css" with { type: "text" };
import { comboItemsFor, comboOptionsFrom, emptyItem, renderComboItem } from "./list";
import type { ComboItem, ComboOption } from "./types";

const css = baseCss + listCss;

export class Combobox extends Component {
    static formAssociated = true;
    static get observedAttributes(): string[] { return ["value", "label", "placeholder", "disabled", "creatable"]; }

    private internalsRef: ElementInternals;
    private input: HTMLInputElement | null;
    private labelEl: HTMLElement | null;
    private listbox: HTMLElement | null;
    private clearButton: HTMLButtonElement | null;
    private chevron: SVGElement | null;
    private optionSlot: HTMLSlotElement | null;
    private options: ComboOption[] = [];
    private items: ComboItem[] = [];
    private activeIndex = -1;
    private selectedValue = "";
    private selectedLabel = "";

    constructor() {
        super({ css, template: template as unknown as string });
        this.internalsRef = this.attachInternals();
        this.input = this.shadowRoot?.querySelector("input") ?? null;
        this.labelEl = this.shadowRoot?.querySelector(".label") ?? null;
        this.listbox = this.shadowRoot?.querySelector("[role='listbox']") ?? null;
        this.clearButton = this.shadowRoot?.querySelector("[data-clear]") ?? null;
        this.chevron = this.shadowRoot?.querySelector(".chevron") ?? null;
        this.optionSlot = this.shadowRoot?.querySelector("slot") ?? null;
    }

    override connectedCallback(): void {
        for (const prop of ["value", "disabled"]) upgradeProperty(this, prop);
        this.input?.addEventListener("focus", this.onFocus);
        this.input?.addEventListener("input", this.onInput);
        this.input?.addEventListener("keydown", this.onKeydown);
        this.input?.addEventListener("blur", this.onBlur);
        this.clearButton?.addEventListener("mousedown", this.onClear);
        this.optionSlot?.addEventListener("slotchange", this.syncOptions);
        this.syncOptions();
        this.syncAttributes();
    }

    disconnectedCallback(): void {
        this.input?.removeEventListener("focus", this.onFocus);
        this.input?.removeEventListener("input", this.onInput);
        this.input?.removeEventListener("keydown", this.onKeydown);
        this.input?.removeEventListener("blur", this.onBlur);
        this.clearButton?.removeEventListener("mousedown", this.onClear);
        this.optionSlot?.removeEventListener("slotchange", this.syncOptions);
    }

    attributeChangedCallback(name: string, _oldValue: string | null, value: string | null): void {
        if (name === "value") this.value = value ?? "";
        else this.syncAttributes();
    }

    get value(): string { return this.selectedValue; }
    set value(value: string) {
        this.selectedValue = value ?? "";
        const option = this.options.find(item => item.value === this.selectedValue);
        this.selectedLabel = option?.label ?? this.selectedValue;
        this.syncDisplay();
    }

    get disabled(): boolean { return this.hasAttribute("disabled"); }
    set disabled(value: boolean) { value ? this.setAttribute("disabled", "") : this.removeAttribute("disabled"); }

    override focus(): void { this.input?.focus(); }

    private syncAttributes(): void {
        if (this.labelEl) {
            const label = this.getAttribute("label") ?? "";
            this.labelEl.textContent = label;
            this.labelEl.hidden = label === "";
        }
        if (this.input) {
            this.input.placeholder = this.getAttribute("placeholder") ?? "";
            this.input.disabled = this.disabled;
        }
        this.syncDisplay();
    }

    private syncOptions = (): void => {
        this.options = comboOptionsFrom(this);
        this.value = this.getAttribute("value") ?? this.selectedValue;
    };

    private syncDisplay(): void {
        if (this.input && document.activeElement !== this.input) this.input.value = this.selectedLabel;
        this.internalsRef.setFormValue(this.selectedValue);
        if (this.clearButton) this.clearButton.hidden = this.selectedLabel === "";
        if (this.chevron) this.chevron.toggleAttribute("hidden", this.selectedLabel !== "");
    }

    private renderList(query: string): void {
        if (!this.listbox) return;
        this.items = comboItemsFor(this.options, query);
        if (this.items.length === 0 && query && this.hasAttribute("creatable")) {
            this.items = [{ kind: "create", value: query, label: `Add "${query}"`, disabled: false }];
        }
        this.listbox.replaceChildren(...this.items.map((item, index) =>
            renderComboItem(item, index, this.activeIndex, this.selectedValue, this.selectItem),
        ));
        if (this.items.length === 0) this.listbox.append(emptyItem());
        this.listbox.hidden = false;
        this.input?.setAttribute("aria-expanded", "true");
    }

    private selectItem = (item: ComboItem): void => {
        const label = item.kind === "create" ? item.value : item.label;
        this.selectedValue = item.value;
        this.selectedLabel = label;
        if (this.input) this.input.value = label;
        this.internalsRef.setFormValue(item.value);
        this.hideList();
        this.dispatchEvent(new CustomEvent("change", { bubbles: true, composed: true, detail: { value: item.value, label, created: item.kind === "create" } }));
    };

    private hideList(): void {
        if (this.listbox) this.listbox.hidden = true;
        this.input?.setAttribute("aria-expanded", "false");
        this.input?.removeAttribute("aria-activedescendant");
        this.activeIndex = -1;
    }

    private onFocus = (): void => this.renderList(this.input?.value.trim() ?? "");
    private onInput = (): void => {
        if (this.clearButton) this.clearButton.hidden = this.input?.value === "";
        this.activeIndex = -1;
        this.renderList(this.input?.value.trim() ?? "");
    };
    private onBlur = (): void => {
        window.setTimeout(() => { this.hideList(); this.syncDisplay(); }, 120);
    };
    private onClear = (event: MouseEvent): void => {
        event.preventDefault();
        this.selectItem({ kind: "option", value: "", label: "", disabled: false });
        this.input?.focus();
    };
    private onKeydown = (event: KeyboardEvent): void => {
        if (event.key === "ArrowDown" || event.key === "ArrowUp") this.moveActive(event);
        else if (event.key === "Enter") this.confirmActive(event);
        else if (event.key === "Escape") { event.preventDefault(); this.hideList(); this.syncDisplay(); }
    };

    private moveActive(event: KeyboardEvent): void {
        event.preventDefault();
        if (this.listbox?.hidden) this.renderList(this.input?.value.trim() ?? "");
        if (this.items.length === 0) return;
        const step = event.key === "ArrowDown" ? 1 : -1;
        this.activeIndex = Math.max(0, Math.min(this.items.length - 1, this.activeIndex + step));
        this.renderList(this.input?.value.trim() ?? "");
        this.input?.setAttribute("aria-activedescendant", `option-${this.activeIndex}`);
    }

    private confirmActive(event: KeyboardEvent): void {
        const item = this.items[this.activeIndex];
        if (!item) return;
        event.preventDefault();
        this.selectItem(item);
    }
}
