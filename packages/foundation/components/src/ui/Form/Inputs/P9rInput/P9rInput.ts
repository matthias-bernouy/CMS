import { Component } from "@bernouy/components/base";
import template from "./ui/template.html" with { type: "text" };
import baseCss from "./ui/styles/base.css" with { type: "text" };
import variantCss from "./ui/styles/variant.css" with { type: "text" };
import responsiveCss from "./ui/styles/responsive.css" with { type: "text" };
import { upgradeProperty, updateCounter, nextLabelId } from "./compute";
import { syncLabel, syncMaxCount, syncAll } from "./sync";
import { handleInput, handleChange } from "./listener";

const css = baseCss + variantCss + responsiveCss;

export class P9rInput extends Component {
    static formAssociated = true;
    static get observedAttributes() {
        return [
            "value",
            "label",
            "placeholder",
            "type",
            "inputmode",
            "min",
            "max",
            "step",
            "hint",
            "hint-level",
            "max-count",
            "invalid",
            "disabled",
            "required",
        ];
    }

    private _internals: ElementInternals;
    private _input: HTMLInputElement | null;
    private _labelEl: HTMLLabelElement | null;
    private _hintEl: HTMLElement | null;
    private _metaEl: HTMLElement | null;
    private _counterEl: HTMLElement | null;
    private _countEl: HTMLElement | null;
    private _maxEl: HTMLElement | null;
    private _defaultValue = "";
    private _defaultsCaptured = false;

    constructor() {
        super({ css, template: template as unknown as string });
        this._internals = this.attachInternals();
        const r = this.shadowRoot!;
        this._labelEl = r.querySelector(".label");
        this._input = r.querySelector(".input");
        this._hintEl = r.querySelector(".hint");
        this._metaEl = r.querySelector(".meta");
        this._counterEl = r.querySelector(".counter");
        this._countEl = r.querySelector(".count");
        this._maxEl = r.querySelector(".max");
        const labelId = nextLabelId();
        if (this._labelEl && this._input) {
            this._labelEl.id = labelId;
            this._input.setAttribute("aria-labelledby", labelId);
        }
    }

    override connectedCallback() {
        if (!this._defaultsCaptured) {
            this._defaultValue = this.getAttribute("value") ?? "";
            this._defaultsCaptured = true;
        }
        ["value", "disabled", "required"].forEach((p) => upgradeProperty(this, p));
        this._input?.addEventListener("input", this._onInput);
        this._input?.addEventListener("change", this._onChange);
        syncAll(this, this._input, this._labelEl, this._hintEl, this._metaEl, this._counterEl, this._maxEl);
        const initial = this.getAttribute("value");
        if (initial !== null) {
            this.value = initial;
        } else {
            updateCounter(this, this._input, this._counterEl, this._countEl);
        }
    }

    disconnectedCallback() {
        this._input?.removeEventListener("input", this._onInput);
        this._input?.removeEventListener("change", this._onChange);
    }

    formResetCallback() {
        this.value = this._defaultValue;
    }

    attributeChangedCallback(name: string, _oldVal: string | null, newVal: string | null) {
        if (!this._input) {
            return;
        }
        if (name === "value" && newVal !== null) {
            this.value = newVal;
        } else if (name === "label") {
            syncLabel(this, this._labelEl);
        } else if (name === "max-count") {
            syncMaxCount(this, this._counterEl, this._maxEl, this._hintEl, this._metaEl);
            updateCounter(this, this._input, this._counterEl, this._countEl);
        } else {
            syncAll(this, this._input, this._labelEl, this._hintEl, this._metaEl, this._counterEl, this._maxEl);
        }
    }

    get value(): string {
        return this._input?.value ?? "";
    }
    set value(v: string) {
        if (!this._input) {
            return;
        }
        this._input.value = v;
        this._internals.setFormValue(v);
        updateCounter(this, this._input, this._counterEl, this._countEl);
    }

    get name(): string {
        return this.getAttribute("name") ?? "";
    }
    get disabled(): boolean {
        return this._input?.disabled ?? false;
    }
    set disabled(v: boolean) {
        v ? this.setAttribute("disabled", "") : this.removeAttribute("disabled");
    }
    get required(): boolean {
        return this.hasAttribute("required");
    }
    set required(v: boolean) {
        v ? this.setAttribute("required", "") : this.removeAttribute("required");
    }
    override focus() {
        this._input?.focus();
    }

    private _onInput = () => handleInput(this, this._input, this._internals, this._counterEl, this._countEl);
    private _onChange = () => handleChange(this, this._input, this._internals);
}
