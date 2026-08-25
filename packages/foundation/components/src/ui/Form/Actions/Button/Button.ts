import { Component, upgradeProperty } from "@bernouy/components/base";

import template from "./template.html" with { type: "text" };
import baseCss from "./base.css" with { type: "text" };
import variantCss from "./variant.css" with { type: "text" };
const css = baseCss + variantCss;

export class Button extends Component {
    static formAssociated = true;
    private _internals: ElementInternals;
    private _btn: HTMLButtonElement | null;

    constructor() {
        super({ css, template: template as unknown as string });
        this._internals = this.attachInternals();
        this._btn = this.shadowRoot?.querySelector("button") ?? null;
    }

    static get observedAttributes() {
        return [
            "type",
            "disabled",
            "aria-label",
            "aria-pressed",
            "aria-expanded",
            "aria-haspopup",
            "aria-controls",
            "title",
        ];
    }

    override connectedCallback() {
        for (const prop of ["type", "disabled"]) {
            upgradeProperty(this, prop);
        }

        if (!this.hasAttribute("type")) {
            this.setAttribute("type", "button");
        }
        if (!this.hasAttribute("variant")) {
            this.setAttribute("variant", "filled");
        }
        this._syncAccessibility();

        this.addEventListener("click", this._handleClick);
    }

    disconnectedCallback() {
        this.removeEventListener("click", this._handleClick);
    }

    private _handleClick = (e: Event) => {
        if (this.hasAttribute("disabled")) {
            e.stopImmediatePropagation();
            return;
        }

        const form = this._internals.form;
        if (!form) {
            return;
        }

        const type = this.getAttribute("type");
        if (type === "submit") {
            form.requestSubmit();
        }
        if (type === "reset") {
            form.reset();
        }
    };

    attributeChangedCallback(name: string, _oldVal: string | null, newVal: string | null) {
        if (!this._btn) {
            return;
        }
        if (name === "type") {
            this._btn.type = (newVal ?? "button") as any;
        }
        if (name === "disabled") {
            this._btn.disabled = this.hasAttribute("disabled");
        }
        if (name.startsWith("aria-") || name === "title") {
            if (newVal === null) {
                this._btn.removeAttribute(name);
            } else {
                this._btn.setAttribute(name, newVal);
            }
        }
    }

    get disabled() {
        return this.hasAttribute("disabled");
    }

    set disabled(val: boolean) {
        if (val) {
            this.setAttribute("disabled", "");
        } else {
            this.removeAttribute("disabled");
        }
    }

    override focus() {
        this._btn?.focus();
    }

    private _syncAccessibility(): void {
        for (const name of ["aria-label", "aria-pressed", "aria-expanded", "aria-haspopup", "aria-controls", "title"]) {
            const value = this.getAttribute(name);
            if (value !== null) {
                this._btn?.setAttribute(name, value);
            }
        }
    }
}
