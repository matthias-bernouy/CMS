import { Component } from "@bernouy/cms-blocs/base";

import template from './template.html' with { type: 'text' };
import css from './style.css' with { type: 'text' };

export class AccordionItem extends Component {

    private _header: HTMLButtonElement | null;

    static get observedAttributes() {
        return ['open', 'disabled'];
    }

    constructor() {
        super({
            css,
            template: template as unknown as string,
        });
        this._header = this.shadowRoot?.querySelector('.header') ?? null;
    }

    override connectedCallback() {
        for (const prop of ['open', 'disabled']) this._upgradeProperty(prop);
        this._header?.addEventListener('click', this._toggle);
        this._syncAria();
    }

    disconnectedCallback() {
        this._header?.removeEventListener('click', this._toggle);
    }

    attributeChangedCallback(name: string, _oldVal: string | null, _newVal: string | null) {
        if (name === 'open' || name === 'disabled') this._syncAria();
    }

    private _toggle = () => {
        if (this.hasAttribute('disabled')) return;
        const willOpen = !this.hasAttribute('open');
        if (willOpen) this.setAttribute('open', '');
        else this.removeAttribute('open');
        this.dispatchEvent(new CustomEvent('accordion-item-toggle', {
            bubbles: true,
            detail: { open: willOpen },
        }));
    };

    private _syncAria() {
        if (!this._header) return;
        this._header.setAttribute('aria-expanded', String(this.hasAttribute('open')));
        if (this.hasAttribute('disabled')) this._header.setAttribute('disabled', '');
        else this._header.removeAttribute('disabled');
    }

    private _upgradeProperty(prop: string) {
        if (Object.prototype.hasOwnProperty.call(this, prop)) {
            const value = (this as any)[prop];
            delete (this as any)[prop];
            (this as any)[prop] = value;
        }
    }

    get open() { return this.hasAttribute('open'); }
    set open(v: boolean) {
        if (v) this.setAttribute('open', '');
        else this.removeAttribute('open');
    }

    get disabled() { return this.hasAttribute('disabled'); }
    set disabled(v: boolean) {
        if (v) this.setAttribute('disabled', '');
        else this.removeAttribute('disabled');
    }
}

if (!customElements.get("p9r-accordion-item")) {
    customElements.define("p9r-accordion-item", AccordionItem);
}
