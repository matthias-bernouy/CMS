import { Component } from "@bernouy/components/base";
import template from "./template.html" with { type: "text" };
import baseCss from "./base.css" with { type: "text" };
import variantCss from "./variant.css" with { type: "text" };
import { upgradeProperty, updateCounter, autosize } from "./compute";
import { syncMaxCount, syncAll } from "./sync";
import { handleInput, handleChange } from "./listener";
import { syncTextareaValidity } from "./validity";

const css = baseCss + variantCss;

export class Textarea extends Component {
    static formAssociated = true;
    static get observedAttributes() {
        return [
            "value",
            "label",
            "aria-label",
            "placeholder",
            "rows",
            "maxlength",
            "minlength",
            "autocomplete",
            "spellcheck",
            "readonly",
            "max-count",
            "hint",
            "hint-level",
            "invalid",
            "disabled",
            "required",
            "autosize",
        ];
    }

    private _internals: ElementInternals;
    private _textarea: HTMLTextAreaElement | null;
    private _label: HTMLLabelElement | null;
    private _hint: HTMLElement | null;
    private _meta: HTMLElement | null;
    private _counter: HTMLElement | null;
    private _count: HTMLElement | null;
    private _max: HTMLElement | null;
    private _defaultValue = "";
    private _defaultsCaptured = false;
    private _showValidationMessage = false;

    constructor() {
        super({ css, template: template as unknown as string });
        this._internals = this.attachInternals();
        const r = this.shadowRoot!;
        this._textarea = r.querySelector("textarea");
        this._label = r.querySelector(".label");
        this._hint = r.querySelector(".hint");
        this._meta = r.querySelector(".meta");
        this._counter = r.querySelector(".counter");
        this._count = r.querySelector(".count");
        this._max = r.querySelector(".max");
    }

    override connectedCallback() {
        if (!this._defaultsCaptured) {
            this._defaultValue = this.getAttribute("value") ?? "";
            this._defaultsCaptured = true;
        }
        ["value", "disabled", "required"].forEach((p) => upgradeProperty(this, p));
        this._textarea?.addEventListener("input", this._onInput);
        this._textarea?.addEventListener("change", this._onChange);
        this.addEventListener("invalid", this._onInvalid);
        syncAll(this, this._textarea, this._label, this._hint, this._meta, this._counter, this._max);
        const initial = this.getAttribute("value");
        if (initial !== null) {
            this.value = initial;
        } else {
            updateCounter(this, this._textarea, this._counter, this._count);
        }
        this._syncValidity();
    }

    disconnectedCallback() {
        this._textarea?.removeEventListener("input", this._onInput);
        this._textarea?.removeEventListener("change", this._onChange);
        this.removeEventListener("invalid", this._onInvalid);
    }

    formResetCallback() {
        this._showValidationMessage = false;
        this.value = this._defaultValue;
    }

    attributeChangedCallback(name: string, _oldVal: string | null, newVal: string | null) {
        if (!this._textarea) {
            return;
        }
        if (name === "value" && newVal !== null) {
            this.value = newVal;
        } else if (name === "max-count") {
            syncMaxCount(this, this._counter, this._max, this._hint, this._meta);
            updateCounter(this, this._textarea, this._counter, this._count);
        } else if (name === "autosize") {
            autosize(this, this._textarea);
        } else {
            syncAll(this, this._textarea, this._label, this._hint, this._meta, this._counter, this._max);
        }
        this._syncValidity();
    }

    get value(): string {
        return this._textarea?.value ?? "";
    }
    set value(v: string) {
        if (!this._textarea) {
            return;
        }
        this._textarea.value = v;
        this._internals.setFormValue(v);
        updateCounter(this, this._textarea, this._counter, this._count);
        autosize(this, this._textarea);
        this._syncValidity();
    }

    get name(): string {
        return this.getAttribute("name") ?? "";
    }
    get disabled(): boolean {
        return this._textarea?.disabled ?? false;
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
        this._textarea?.focus();
    }

    private _onInput = () => {
        handleInput(this, this._textarea, this._internals, this._counter, this._count);
        this._syncValidity();
    };
    private _onChange = () => {
        handleChange(this, this._textarea, this._internals);
        this._syncValidity();
    };
    private _onInvalid = (event: Event) => {
        if (event.target === this) {
            this._showValidationMessage = true;
            this._syncValidity();
        }
    };

    private _syncValidity(): void {
        this._showValidationMessage = syncTextareaValidity(
            this,
            this._internals,
            { textarea: this._textarea, hint: this._hint, meta: this._meta, counter: this._counter },
            this._showValidationMessage,
        );
    }
}
