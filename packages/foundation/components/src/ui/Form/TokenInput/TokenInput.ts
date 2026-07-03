import { Component, upgradeProperty } from "@bernouy/components/base";
import template from "./template.html" with { type: "text" };
import baseCss from "../Combobox/base.css" with { type: "text" };
import listCss from "../Combobox/list.css" with { type: "text" };
import css from "./style.css" with { type: "text" };
import { comboOptionsFrom, createPromptItem, emptyItem, renderComboItem } from "../Combobox/list";
import type { ComboItem, ComboOption } from "../Combobox/types";
import { parseTokens, tokenElement, tokenItemsFor, tokenLabels, tokenValue } from "./tokens";

export class TokenInput extends Component {
    static formAssociated = true;
    static get observedAttributes(): string[] { return ["value", "label", "placeholder", "disabled", "creatable"]; }

    private internalsRef: ElementInternals;
    private input: HTMLInputElement | null;
    private labelEl: HTMLElement | null;
    private tokensEl: HTMLElement | null;
    private listbox: HTMLElement | null;
    private createButton: HTMLButtonElement | null;
    private optionSlot: HTMLSlotElement | null;
    private options: ComboOption[] = [];
    private items: ComboItem[] = [];
    private selected: string[] = [];
    private activeIndex = -1;

    constructor() {
        super({ css: baseCss + listCss + css, template: template as unknown as string });
        this.internalsRef = this.attachInternals();
        this.input = this.shadowRoot?.querySelector("input") ?? null;
        this.labelEl = this.shadowRoot?.querySelector(".label") ?? null;
        this.tokensEl = this.shadowRoot?.querySelector("[data-tokens]") ?? null;
        this.listbox = this.shadowRoot?.querySelector("[role='listbox']") ?? null;
        this.createButton = this.shadowRoot?.querySelector("[data-create]") ?? null;
        this.optionSlot = this.shadowRoot?.querySelector("slot") ?? null;
    }

    override connectedCallback(): void {
        for (const prop of ["value", "disabled"]) upgradeProperty(this, prop);
        this.input?.addEventListener("focus", this.onFocus);
        this.input?.addEventListener("input", this.onInput);
        this.input?.addEventListener("keydown", this.onKeydown);
        this.input?.addEventListener("blur", this.onBlur);
        this.createButton?.addEventListener("mousedown", this.onCreate);
        this.optionSlot?.addEventListener("slotchange", this.syncOptions);
        this.syncOptions();
        this.syncAttributes();
    }

    disconnectedCallback(): void {
        this.input?.removeEventListener("focus", this.onFocus);
        this.input?.removeEventListener("input", this.onInput);
        this.input?.removeEventListener("keydown", this.onKeydown);
        this.input?.removeEventListener("blur", this.onBlur);
        this.createButton?.removeEventListener("mousedown", this.onCreate);
        this.optionSlot?.removeEventListener("slotchange", this.syncOptions);
    }

    attributeChangedCallback(name: string, _oldValue: string | null, value: string | null): void {
        if (name === "value") this.value = value ?? "";
        else this.syncAttributes();
    }

    get value(): string { return tokenValue(this.selected); }
    set value(value: string) {
        this.selected = parseTokens(value);
        this.syncDisplay();
    }

    get values(): string[] { return [...this.selected]; }
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
            this.input.placeholder = this.selected.length ? "" : this.getAttribute("placeholder") ?? "";
            this.input.disabled = this.disabled;
        }
        if (this.createButton) this.createButton.hidden = !this.hasAttribute("creatable");
        this.syncDisplay();
    }

    private syncOptions = (): void => {
        this.options = comboOptionsFrom(this);
        this.value = this.getAttribute("value") ?? this.value;
    };

    private syncDisplay(): void {
        this.renderTokens();
        this.internalsRef.setFormValue(this.value);
        if (this.input) this.input.placeholder = this.selected.length ? "" : this.getAttribute("placeholder") ?? "";
    }

    private renderTokens(): void { this.tokensEl?.replaceChildren(...tokenLabels(this.selected, this.options).map(item => tokenElement(item, this.removeValue))); }

    private renderList(query: string): void {
        if (!this.listbox) return;
        this.items = tokenItemsFor(this.options, this.selected, query, this.hasAttribute("creatable"));
        this.listbox.replaceChildren(...this.items.map((item, index) =>
            renderComboItem(item, index, this.activeIndex, "", this.selectItem),
        ));
        if (this.items.length === 0) this.listbox.append(this.emptyState());
        this.listbox.hidden = false;
        this.input?.setAttribute("aria-expanded", "true");
    }

    private emptyState(): HTMLElement {
        if (!this.hasAttribute("creatable")) return emptyItem();
        return createPromptItem("Type to create", () => this.input?.focus());
    }

    private selectItem = (item: ComboItem): void => {
        if (!this.selected.includes(item.value)) this.selected.push(item.value);
        if (this.input) this.input.value = "";
        this.activeIndex = -1;
        this.syncDisplay();
        this.hideList();
        this.emitChange(item.kind === "create");
    };

    private removeValue = (value: string): void => {
        if (!value) return;
        this.selected = this.selected.filter(item => item !== value);
        this.syncDisplay();
        this.emitChange(false);
        this.input?.focus();
    };

    private emitChange(created: boolean): void {
        this.dispatchEvent(new CustomEvent("change", { bubbles: true, composed: true, detail: { value: this.value, values: this.values, created } }));
    }

    private hideList(): void {
        if (this.listbox) this.listbox.hidden = true;
        this.input?.setAttribute("aria-expanded", "false");
        this.input?.removeAttribute("aria-activedescendant");
        this.activeIndex = -1;
    }

    private onFocus = (): void => this.renderList(this.input?.value.trim() ?? "");
    private onInput = (): void => { this.activeIndex = -1; this.renderList(this.input?.value.trim() ?? ""); };
    private onBlur = (): void => { window.setTimeout(() => this.hideList(), 120); };
    private onCreate = (event: MouseEvent): void => {
        event.preventDefault();
        const value = this.input?.value.trim() ?? "";
        if (value) this.selectItem({ kind: "create", value, label: value, disabled: false });
        else {
            this.input?.focus();
            this.renderList("");
        }
    };
    private onKeydown = (event: KeyboardEvent): void => {
        if (event.key === "ArrowDown" || event.key === "ArrowUp") this.moveActive(event);
        else if (event.key === "Enter" || event.key === ",") this.confirmActive(event);
        else if (event.key === "Escape") { event.preventDefault(); this.hideList(); }
        else if (event.key === "Backspace" && !this.input?.value) this.removeValue(this.selected.at(-1) ?? "");
    };

    private moveActive(event: KeyboardEvent): void {
        event.preventDefault();
        if (this.listbox?.hidden) this.renderList(this.input?.value.trim() ?? "");
        if (this.items.length === 0) return;
        const step = event.key === "ArrowDown" ? 1 : -1;
        this.activeIndex = Math.max(0, Math.min(this.items.length - 1, this.activeIndex + step));
        this.renderList(this.input?.value.trim() ?? "");
    }

    private confirmActive(event: KeyboardEvent): void {
        event.preventDefault();
        const item = this.items[this.activeIndex] ?? this.items[0];
        if (item) this.selectItem(item);
    }
}
