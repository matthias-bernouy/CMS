import { Component } from "@bernouy/cms-blocs/base";

import template from './template.html' with { type: 'text' };
import baseCss from './base.css' with { type: 'text' };
import variantCss from './variant.css' with { type: 'text' };
const css = baseCss + variantCss;

export class Button extends Component {
    static formAssociated = true;
    private _internals: ElementInternals;
    private _btn: HTMLButtonElement | null;

    constructor() {
        super({ css, template: template as unknown as string });
        this._internals = this.attachInternals();
        this._btn = this.shadowRoot?.querySelector('button') ?? null;
    }

    static get observedAttributes() {
        return ['type', 'disabled'];
    }

    override connectedCallback() {
        for (const prop of ['type', 'disabled']) {
            this._upgradeProperty(prop);
        }

        if (!this.hasAttribute('type')) this.setAttribute('type', 'button');
        if (!this.hasAttribute('variant')) this.setAttribute('variant', 'filled');

        this.addEventListener('click', this._handleClick);
    }

    disconnectedCallback() {
        this.removeEventListener('click', this._handleClick);
    }

    private _handleClick = (e: Event) => {
        if (this.hasAttribute('disabled')) {
            e.stopImmediatePropagation();
            return;
        }

        const form = this._internals.form;
        if (!form) return;

        const type = this.getAttribute('type');
        if (type === 'submit') form.requestSubmit();
        if (type === 'reset') form.reset();
    };

    private _upgradeProperty(prop: string) {
        if (this.hasOwnProperty(prop)) {
            let value = (this as any)[prop];
            delete (this as any)[prop];
            (this as any)[prop] = value;
        }
    }

    attributeChangedCallback(name: string, _oldVal: string | null, newVal: string | null) {
        if (!this._btn) return;
        if (name === 'type') this._btn.type = (newVal ?? 'button') as any;
        if (name === 'disabled') this._btn.disabled = this.hasAttribute('disabled');
    }

    get disabled() {
        return this.hasAttribute('disabled');
    }

    set disabled(val: boolean) {
        if (val) this.setAttribute('disabled', '');
        else this.removeAttribute('disabled');
    }
}

if (!customElements.get("p9r-button")) {
    customElements.define("p9r-button", Button);
}
