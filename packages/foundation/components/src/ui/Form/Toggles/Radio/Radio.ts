import { Component, upgradeProperty } from "@bernouy/components/base";

import template from "./template.html" with { type: "text" };
import css from "./style.css" with { type: "text" };

export class Radio extends Component {
    private _input: HTMLInputElement | null;

    static get observedAttributes() {
        return ["checked", "disabled", "value", "name"];
    }

    constructor() {
        super({
            css,
            template: template as unknown as string,
        });
        this._input = this.shadowRoot?.querySelector("input") ?? null;
    }

    override connectedCallback() {
        for (const prop of ["checked", "disabled", "value"]) {
            upgradeProperty(this, prop);
        }

        if (this._input) {
            this._input.checked = this.hasAttribute("checked");
            this._input.disabled = this.hasAttribute("disabled");
            this._input.value = this.getAttribute("value") ?? "";
            if (this.hasAttribute("name")) {
                this._input.name = this.getAttribute("name") ?? "";
            }
            this._input.addEventListener("change", this._onChange);
            this._input.addEventListener("click", this._onClick);
        }

        this.setAttribute("role", "radio");
        this.setAttribute("aria-checked", String(this.hasAttribute("checked")));
        if (!this.hasAttribute("tabindex")) {
            this.setAttribute("tabindex", this.hasAttribute("checked") ? "0" : "-1");
        }
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
        } else if (name === "disabled") {
            this._input.disabled = newVal !== null;
        } else if (name === "value") {
            this._input.value = newVal ?? "";
        } else if (name === "name") {
            this._input.name = newVal ?? "";
        }
    }

    private _onChange = () => {
        const isChecked = this._input?.checked ?? false;
        if (isChecked) {
            this.setAttribute("checked", "");
        } else {
            this.removeAttribute("checked");
        }
        this.dispatchEvent(new Event("change", { bubbles: true }));
    };

    private _onClick = (e: Event) => {
        if (this.hasAttribute("disabled")) {
            e.preventDefault();
            e.stopImmediatePropagation();
        }
    };

    get checked() {
        return this.hasAttribute("checked");
    }
    set checked(v: boolean) {
        if (v) {
            this.setAttribute("checked", "");
        } else {
            this.removeAttribute("checked");
        }
    }

    get disabled() {
        return this.hasAttribute("disabled");
    }
    set disabled(v: boolean) {
        if (v) {
            this.setAttribute("disabled", "");
        } else {
            this.removeAttribute("disabled");
        }
    }

    get value() {
        return this.getAttribute("value") ?? "";
    }
    set value(v: string) {
        this.setAttribute("value", v);
    }
}
