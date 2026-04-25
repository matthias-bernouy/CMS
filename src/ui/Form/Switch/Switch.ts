import { Component } from "../../../base/Component";

import template from './template.html' with { type: 'text' };
import css from './style.css' with { type: 'text' };

export class Switch extends Component {

    static formAssociated = true;
    private _internals: ElementInternals;
    private _input: HTMLInputElement | null;

    static get observedAttributes() {
        return ['checked', 'disabled', 'name', 'value'];
    }

    constructor() {
        super({
            css,
            template: template as unknown as string,
        });
        this._internals = this.attachInternals();
        this._input = this.shadowRoot?.querySelector('input') ?? null;
    }

    override connectedCallback() {
        for (const prop of ['checked', 'disabled', 'name', 'value']) {
            this._upgradeProperty(prop);
        }

        if (this._input) {
            this._input.checked = this.hasAttribute('checked');
            this._input.disabled = this.hasAttribute('disabled');
            if (this.hasAttribute('name'))  this._input.name  = this.getAttribute('name')  ?? '';
            if (this.hasAttribute('value')) this._input.value = this.getAttribute('value') ?? '';
            this._input.addEventListener('change', this._handleChange);
            this._input.addEventListener('click', this._handleClick);
        }

        this.setAttribute('role', 'switch');
        this.setAttribute('aria-checked', String(this.hasAttribute('checked')));

        this._syncFormValue();
    }

    disconnectedCallback() {
        if (this._input) {
            this._input.removeEventListener('change', this._handleChange);
            this._input.removeEventListener('click', this._handleClick);
        }
    }

    attributeChangedCallback(name: string, _oldVal: string | null, newVal: string | null) {
        if (!this._input) return;
        if (name === 'checked') {
            this._input.checked = newVal !== null;
            this.setAttribute('aria-checked', String(newVal !== null));
            this._syncFormValue();
        } else if (name === 'disabled') {
            this._input.disabled = newVal !== null;
        } else if (name === 'name') {
            this._input.name = newVal ?? '';
        } else if (name === 'value') {
            this._input.value = newVal ?? '';
            this._syncFormValue();
        }
    }

    private _handleChange = () => {
        const isChecked = this._input?.checked ?? false;
        if (isChecked) this.setAttribute('checked', '');
        else this.removeAttribute('checked');

        this._syncFormValue();
        this.dispatchEvent(new Event('change', { bubbles: true }));
    };

    private _handleClick = (e: Event) => {
        if (this.hasAttribute('disabled')) {
            e.preventDefault();
            e.stopImmediatePropagation();
        }
    };

    private _syncFormValue() {
        const checked = this._input?.checked ?? this.hasAttribute('checked');
        this._internals.setFormValue(checked ? (this.getAttribute('value') ?? 'on') : null);
    }

    private _upgradeProperty(prop: string) {
        if (Object.prototype.hasOwnProperty.call(this, prop)) {
            const value = (this as any)[prop];
            delete (this as any)[prop];
            (this as any)[prop] = value;
        }
    }

    get checked() { return this.hasAttribute('checked'); }
    set checked(val: boolean) {
        if (val) this.setAttribute('checked', '');
        else this.removeAttribute('checked');
    }

    get disabled() { return this.hasAttribute('disabled'); }
    set disabled(val: boolean) {
        if (val) this.setAttribute('disabled', '');
        else this.removeAttribute('disabled');
    }

    get name() { return this.getAttribute('name') ?? ''; }
    set name(val: string) { this.setAttribute('name', val); }

    get value() { return this.getAttribute('value') ?? 'on'; }
    set value(val: string) { this.setAttribute('value', val); }

    get form() { return this._internals.form; }

    override click() {
        this._input?.click();
    }
}

if (!customElements.get("p9r-switch")) {
    customElements.define("p9r-switch", Switch);
}
