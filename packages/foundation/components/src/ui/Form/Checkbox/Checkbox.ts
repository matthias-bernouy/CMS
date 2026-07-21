import { FormControlElement } from "../FormControlElement";

import template from "./template.html" with { type: "text" };
import baseCss from "./base.css" with { type: "text" };
import variantCss from "./variant.css" with { type: "text" };
const css = baseCss + variantCss;

import { upgradeProperty, syncFormValue, initInput, applyAttribute } from "./compute";
import { handleChange, handleClick } from "./listener";

export class Checkbox extends FormControlElement {
    private _input: HTMLInputElement | null;
    private _labelText: HTMLElement | null;
    private _labelSlot: HTMLSlotElement | null;
    private _defaultIndeterminate = false;

    static get observedAttributes() {
        return ["checked", "disabled", "name", "value", "indeterminate"];
    }

    constructor() {
        super({ css, template: template as unknown as string });
        this._input = this.shadowRoot?.querySelector("input") ?? null;
        this._labelText = this.shadowRoot?.querySelector(".label-text") ?? null;
        this._labelSlot = this.shadowRoot?.querySelector(".label-text slot:not([name])") ?? null;
    }

    override connectedCallback() {
        this._captureDefaults();
        ["checked", "disabled", "name", "value", "indeterminate"].forEach((p) => upgradeProperty(this, p));
        initInput(this, this._input);
        this._input?.addEventListener("change", this._onChange);
        this._input?.addEventListener("click", this._onClick);
        this._labelSlot?.addEventListener("slotchange", this._syncLabel);
        this._syncLabel();
        syncFormValue(this, this._input, this._internals);
    }

    disconnectedCallback() {
        this._input?.removeEventListener("change", this._onChange);
        this._input?.removeEventListener("click", this._onClick);
        this._labelSlot?.removeEventListener("slotchange", this._syncLabel);
    }

    /** Capture the boot-time `indeterminate` too (the base captures `checked`);
     *  idempotent via the shared `_defaultsCaptured` guard. */
    protected override _captureDefaults() {
        if (this._defaultsCaptured) {
            return;
        }
        this._defaultIndeterminate = this.hasAttribute("indeterminate");
        super._captureDefaults();
    }

    /** Collapse the label area only when no label is actually provided. CSS
     *  `:empty` can't be used on a `<slot>`: a slot is `:empty` whenever it has no
     *  fallback children, regardless of assigned light-DOM content — so it hid the
     *  label even when one was slotted in. Detect real slotted content instead. */
    private _syncLabel = () => {
        if (!this._labelText || !this._labelSlot) {
            return;
        }
        const hasLabel = this._labelSlot
            .assignedNodes({ flatten: true })
            .some((n) => n.nodeType === Node.ELEMENT_NODE || (n.textContent ?? "").trim() !== "");
        this._labelText.classList.toggle("is-empty", !hasLabel);
    };

    override formResetCallback() {
        this.indeterminate = this._defaultIndeterminate;
        super.formResetCallback();
    }

    attributeChangedCallback(name: string, _oldVal: string | null, newVal: string | null) {
        applyAttribute(this, this._input, this._internals, name, newVal);
    }

    private _onChange = () => handleChange(this, this._input, this._internals);
    private _onClick = (e: Event) => handleClick(this, e);

    get indeterminate() {
        return this._input?.indeterminate ?? this.hasAttribute("indeterminate");
    }
    set indeterminate(v: boolean) {
        v ? this.setAttribute("indeterminate", "") : this.removeAttribute("indeterminate");
        if (this._input) {
            this._input.indeterminate = v;
        }
    }

    override click() {
        this._input?.click();
    }
}
