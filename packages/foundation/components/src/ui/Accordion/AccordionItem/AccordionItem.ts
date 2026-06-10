import { Component, upgradeProperty } from "@bernouy/components/base";

import template from './template.html' with { type: 'text' };
import css from './style.css' with { type: 'text' };

export class AccordionItem extends Component {

    // Two toggle triggers (the title button + the chevron button); the
    // `header-actions` slot sits between them, OUTSIDE both buttons, so action
    // controls (e.g. a delete button) neither nest inside a button nor toggle.
    private _toggles: HTMLButtonElement[];
    private _titleToggle: HTMLElement | null;

    static get observedAttributes() {
        return ['open', 'disabled'];
    }

    constructor() {
        super({
            css,
            template: template as unknown as string,
        });
        this._toggles = Array.from(this.shadowRoot?.querySelectorAll('.toggle') ?? []) as HTMLButtonElement[];
        this._titleToggle = this.shadowRoot?.querySelector('.title-toggle') ?? null;
    }

    override connectedCallback() {
        for (const prop of ['open', 'disabled']) upgradeProperty(this, prop);
        this._toggles.forEach(t => t.addEventListener('click', this._toggle));
        this._syncAria();
    }

    disconnectedCallback() {
        this._toggles.forEach(t => t.removeEventListener('click', this._toggle));
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
        this._titleToggle?.setAttribute('aria-expanded', String(this.hasAttribute('open')));
        const disabled = this.hasAttribute('disabled');
        for (const t of this._toggles) {
            if (disabled) t.setAttribute('disabled', '');
            else t.removeAttribute('disabled');
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
