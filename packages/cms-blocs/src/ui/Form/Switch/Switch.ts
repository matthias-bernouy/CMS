import { Component } from "../../../base/Component";

import template from './template.html' with { type: 'text' };
import css from './style.css' with { type: 'text' };

import { upgradeProperty, syncFormValue } from './compute';
import { handleChange, handleClick } from './listener';

export class Switch extends Component {

    static formAssociated = true;
    private _internals: ElementInternals;
    private _input: HTMLInputElement | null;
    private _defaultChecked = false;
    private _defaultsCaptured = false;

    static get observedAttributes() { return ['checked', 'disabled', 'name', 'value']; }

    constructor() {
        super({ css, template: template as unknown as string });
        this._internals = this.attachInternals();
        this._input = this.shadowRoot?.querySelector('input') ?? null;
    }

    override connectedCallback() {
        if (!this._defaultsCaptured) {
            this._defaultChecked = this.hasAttribute('checked');
            this._defaultsCaptured = true;
        }

        for (const prop of ['checked', 'disabled', 'name', 'value']) upgradeProperty(this, prop);

        if (this._input) {
            this._input.checked = this.hasAttribute('checked');
            this._input.disabled = this.hasAttribute('disabled');
            if (this.hasAttribute('name'))  this._input.name  = this.getAttribute('name')  ?? '';
            if (this.hasAttribute('value')) this._input.value = this.getAttribute('value') ?? '';
            this._input.addEventListener('change', this._onChange);
            this._input.addEventListener('click', this._onClick);
        }

        this.setAttribute('role', 'switch');
        this.setAttribute('aria-checked', String(this.hasAttribute('checked')));
        syncFormValue(this, this._input, this._internals);
    }

    disconnectedCallback() {
        this._input?.removeEventListener('change', this._onChange);
        this._input?.removeEventListener('click', this._onClick);
    }

    formResetCallback() { this.checked = this._defaultChecked; }

    attributeChangedCallback(name: string, _oldVal: string | null, newVal: string | null) {
        if (!this._input) return;
        if (name === 'checked') {
            this._input.checked = newVal !== null;
            this.setAttribute('aria-checked', String(newVal !== null));
            syncFormValue(this, this._input, this._internals);
        } else if (name === 'disabled') {
            this._input.disabled = newVal !== null;
        } else if (name === 'name') {
            this._input.name = newVal ?? '';
        } else if (name === 'value') {
            this._input.value = newVal ?? '';
            syncFormValue(this, this._input, this._internals);
        }
    }

    private _onChange = () => handleChange(this, this._input, this._internals);
    private _onClick = (e: Event) => handleClick(this, e);

    get checked() { return this.hasAttribute('checked'); }
    set checked(v: boolean) { v ? this.setAttribute('checked', '') : this.removeAttribute('checked'); }

    get disabled() { return this.hasAttribute('disabled'); }
    set disabled(v: boolean) { v ? this.setAttribute('disabled', '') : this.removeAttribute('disabled'); }

    get name() { return this.getAttribute('name') ?? ''; }
    set name(v: string) { this.setAttribute('name', v); }

    get value() { return this.getAttribute('value') ?? 'on'; }
    set value(v: string) { this.setAttribute('value', v); }

    get form() { return this._internals.form; }

    override click() { this._input?.click(); }
}

if (!customElements.get("p9r-switch")) {
    customElements.define("p9r-switch", Switch);
}
