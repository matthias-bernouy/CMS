import { FormControlElement } from "../FormControlElement";

import template from "./template.html" with { type: "text" };
import css from "./style.css" with { type: "text" };

import { upgradeProperty, syncFormValue } from "./compute";
import { handleChange, handleClick } from "./listener";

export class Switch extends FormControlElement {
    private _input: HTMLInputElement | null;

    static get observedAttributes() {
        return ["checked", "disabled", "name", "value"];
    }

    constructor() {
        super({ css, template: template as unknown as string });
        this._input = this.shadowRoot?.querySelector("input") ?? null;
    }

    override connectedCallback() {
        this._captureDefaults();

        for (const prop of ["checked", "disabled", "name", "value"]) {
            upgradeProperty(this, prop);
        }

        if (this._input) {
            this._input.checked = this.hasAttribute("checked");
            this._input.disabled = this.hasAttribute("disabled");
            if (this.hasAttribute("name")) {
                this._input.name = this.getAttribute("name") ?? "";
            }
            if (this.hasAttribute("value")) {
                this._input.value = this.getAttribute("value") ?? "";
            }
            this._input.addEventListener("change", this._onChange);
            this._input.addEventListener("click", this._onClick);
        }

        this.setAttribute("role", "switch");
        this.setAttribute("aria-checked", String(this.hasAttribute("checked")));
        syncFormValue(this, this._input, this._internals);
    }

    disconnectedCallback() {
        this._input?.removeEventListener("change", this._onChange);
        this._input?.removeEventListener("click", this._onClick);
    }

    attributeChangedCallback(name: string, _oldVal: string | null, newVal: string | null) {
        if (!this._input) {
            return;
        }
        if (name === "checked") {
            this._input.checked = newVal !== null;
            this.setAttribute("aria-checked", String(newVal !== null));
            syncFormValue(this, this._input, this._internals);
        } else if (name === "disabled") {
            this._input.disabled = newVal !== null;
        } else if (name === "name") {
            this._input.name = newVal ?? "";
        } else if (name === "value") {
            this._input.value = newVal ?? "";
            syncFormValue(this, this._input, this._internals);
        }
    }

    private _onChange = () => handleChange(this, this._input, this._internals);
    private _onClick = (e: Event) => handleClick(this, e);

    override click() {
        this._input?.click();
    }
}
