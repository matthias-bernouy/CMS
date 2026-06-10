import { Component, upgradeProperty } from "@bernouy/components/base";

import template from './template.html' with { type: 'text' };
import css from './style.css' with { type: 'text' };

export class IconButton extends Component {
    static formAssociated = true;
    private _internals: ElementInternals;
    private _btn: HTMLButtonElement | null;

    static get observedAttributes() {
        return ['type', 'disabled', 'aria-label'];
    }

    constructor() {
        super({ css, template: template as unknown as string });
        this._internals = this.attachInternals();
        this._btn = this.shadowRoot?.querySelector('button') ?? null;
    }

    override connectedCallback() {
        for (const prop of ['type', 'disabled']) {
            upgradeProperty(this, prop);
        }

        if (!this.hasAttribute('type'))    this.setAttribute('type', 'button');
        if (!this.hasAttribute('variant')) this.setAttribute('variant', 'ghost');

        this.addEventListener('click', this._handleClick);
        this._syncAriaLabel();
    }

    disconnectedCallback() {
        this.removeEventListener('click', this._handleClick);
    }

    attributeChangedCallback(name: string, _oldVal: string | null, newVal: string | null) {
        if (!this._btn) return;
        if (name === 'type')       this._btn.type = (newVal ?? 'button') as any;
        if (name === 'disabled')   this._btn.disabled = this.hasAttribute('disabled');
        if (name === 'aria-label') this._syncAriaLabel();
    }

    private _syncAriaLabel() {
        if (!this._btn) return;
        const label = this.getAttribute('aria-label');
        if (label) this._btn.setAttribute('aria-label', label);
        else this._btn.removeAttribute('aria-label');
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
        if (type === 'reset')  form.reset();
    };

    get disabled() { return this.hasAttribute('disabled'); }
    set disabled(val: boolean) {
        if (val) this.setAttribute('disabled', '');
        else this.removeAttribute('disabled');
    }
}
