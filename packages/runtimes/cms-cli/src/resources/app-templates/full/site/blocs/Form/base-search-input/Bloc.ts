import template from "./template.html" with { type: "text" };
import css from "./style.css" with { type: "text" };
import { Component } from "@bernouy/components/base";

type SearchOption = {
    value: string;
    label: string;
    disabled: boolean;
};

export class Bloc extends Component {
    static formAssociated = true;
    static get observedAttributes() {
        return ["value", "placeholder", "disabled", "required"];
    }

    private readonly _internals: ElementInternals;
    private readonly _input: HTMLInputElement | null;
    private readonly _suggestions: HTMLElement | null;
    private readonly _slot: HTMLSlotElement | null;
    private _observer: MutationObserver | null = null;
    private _defaultValue = "";
    private _value = "";
    private _hasFocus = false;

    constructor() {
        super({ css, template: template as unknown as string });
        this._internals = this.attachInternals();
        this._input = this.shadowRoot?.querySelector<HTMLInputElement>(".input") ?? null;
        this._suggestions = this.shadowRoot?.querySelector<HTMLElement>(".suggestions") ?? null;
        this._slot = this.shadowRoot?.querySelector<HTMLSlotElement>(".options-slot") ?? null;
    }

    override connectedCallback(): void {
        this._defaultValue = this.getAttribute("value") ?? "";
        this._input?.addEventListener("input", this._onInput);
        this._input?.addEventListener("change", this._onChange);
        this._input?.addEventListener("focus", this._onFocus);
        this._input?.addEventListener("blur", this._onBlur);
        this._slot?.addEventListener("slotchange", this._syncContent);
        this._observeOptions();
        this._syncAttributes();
        this.value = this._defaultValue;
        this._syncContent();
    }

    disconnectedCallback(): void {
        this._input?.removeEventListener("input", this._onInput);
        this._input?.removeEventListener("change", this._onChange);
        this._input?.removeEventListener("focus", this._onFocus);
        this._input?.removeEventListener("blur", this._onBlur);
        this._slot?.removeEventListener("slotchange", this._syncContent);
        this._observer?.disconnect();
        this._observer = null;
    }

    attributeChangedCallback(name: string): void {
        if (name === "value") {
            this._defaultValue = this.getAttribute("value") ?? "";
        }
        this._syncAttributes();
    }

    formResetCallback(): void {
        this.value = this._defaultValue;
    }

    get value(): string {
        return this._value;
    }

    set value(value: string) {
        this._setValue(value, this._labelForValue(value));
    }

    get name(): string {
        return this.getAttribute("name") ?? "";
    }

    get type(): string {
        return "search";
    }

    get disabled(): boolean {
        return this.hasAttribute("disabled");
    }

    set disabled(value: boolean) {
        this.toggleAttribute("disabled", value);
    }

    get required(): boolean {
        return this.hasAttribute("required");
    }

    set required(value: boolean) {
        this.toggleAttribute("required", value);
    }

    override focus(): void {
        this._input?.focus();
    }

    checkValidity(): boolean {
        return this._input?.checkValidity() ?? true;
    }

    reportValidity(): boolean {
        return this._input?.reportValidity() ?? true;
    }

    private readonly _onInput = (): void => {
        const displayValue = this._input?.value ?? "";
        this._setValue(displayValue, displayValue);
        this._syncOptions();
        this.dispatchEvent(new Event("input", { bubbles: true, composed: true }));
    };

    private readonly _onChange = (): void => {
        this._internals.setFormValue(this.value);
        this.dispatchEvent(new Event("change", { bubbles: true, composed: true }));
    };

    private readonly _onFocus = (): void => {
        this._hasFocus = true;
        this._syncOptions();
    };

    private readonly _onBlur = (): void => {
        window.setTimeout(() => {
            this._hasFocus = false;
            this._hideOptions();
        }, 120);
    };

    private readonly _syncContent = (): void => {
        this.toggleAttribute("has-status", this._hasStatusContent());
        this._syncDisplayFromValue();
        this._syncOptions();
    };

    private readonly _syncOptions = (): void => {
        if (!this._suggestions) return;

        const options = this._options();
        this._suggestions.replaceChildren(...options.map(option => this._optionButton(option)));
        this._suggestions.hidden = this.hasAttribute("has-status")
            || !this._hasFocus
            || options.length === 0
            || this.disabled;
    };

    private _syncAttributes(): void {
        if (!this._input) return;

        this._input.placeholder = this.getAttribute("placeholder") ?? "";
        this._input.disabled = this.disabled;
        this._input.required = this.required;

        const value = this.getAttribute("value");
        if (value !== null && this._value !== value) {
            this.value = value;
        } else {
            this._internals.setFormValue(this._value);
        }
    }

    private _observeOptions(): void {
        this._observer?.disconnect();

        const MutationObserverCtor = this.ownerDocument.defaultView?.MutationObserver ?? MutationObserver;
        this._observer = new MutationObserverCtor(this._syncContent);
        this._observer.observe(this, {
            attributes: true,
            attributeFilter: ["value", "disabled"],
            childList: true,
            characterData: true,
            subtree: true,
        });
    }

    private _options(): SearchOption[] {
        return Array.from(this.querySelectorAll("option"))
            .map(option => this._searchOption(option));
    }

    private _hasStatusContent(): boolean {
        return Array.from(this.children)
            .some(child => child.localName !== "option");
    }

    private _searchOption(option: HTMLOptionElement): SearchOption {
        const value = option.value || option.textContent?.trim() || "";
        const label = option.textContent?.trim() || value;
        return { value, label, disabled: option.disabled };
    }

    private _labelForValue(value: string): string {
        return this._options().find(option => option.value === value)?.label ?? value;
    }

    private _syncDisplayFromValue(): void {
        if (!this._input) return;

        const displayValue = this._labelForValue(this._value);
        if (this._input.value !== displayValue) {
            this._input.value = displayValue;
        }
    }

    private _setValue(value: string, displayValue: string): void {
        this._value = value;
        if (this._input && this._input.value !== displayValue) {
            this._input.value = displayValue;
        }
        this._internals.setFormValue(value);
        this._syncOptions();
    }

    private _optionButton(option: SearchOption): HTMLButtonElement {
        const button = document.createElement("button");
        button.className = "suggestion";
        button.type = "button";
        button.role = "option";
        button.textContent = option.label;
        button.disabled = option.disabled;
        button.addEventListener("mousedown", event => event.preventDefault());
        button.addEventListener("click", () => {
            if (option.disabled) return;
            this._setValue(option.value, option.label);
            this._hideOptions();
            this.dispatchEvent(new Event("input", { bubbles: true, composed: true }));
            this.dispatchEvent(new Event("change", { bubbles: true, composed: true }));
        });
        return button;
    }

    private _hideOptions(): void {
        if (this._suggestions) this._suggestions.hidden = true;
    }
}
