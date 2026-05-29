import { Component } from "@bernouy/cms-blocs/base";

import template from './template.html' with { type: 'text' };
import baseCss from './base.css' with { type: 'text' };
import variantCss from './variant.css' with { type: 'text' };
const css = baseCss + variantCss;

import { upgradeProperty, syncFormValue, initInput, applyAttribute } from './compute';
import { handleChange, handleClick } from './listener';

export class Checkbox extends Component {

    static formAssociated = true;
    private _internals: ElementInternals;
    private _input: HTMLInputElement | null;
    private _defaultChecked = false;
    private _defaultIndeterminate = false;
    private _defaultsCaptured = false;

    static get observedAttributes() {
        return ['checked', 'disabled', 'name', 'value', 'indeterminate'];
    }

    constructor() {
        super({ css, template: template as unknown as string });
        this._internals = this.attachInternals();
        this._input = this.shadowRoot?.querySelector('input') ?? null;
    }

    override connectedCallback() {
        if (!this._defaultsCaptured) {
            this._defaultChecked = this.hasAttribute('checked');
            this._defaultIndeterminate = this.hasAttribute('indeterminate');
            this._defaultsCaptured = true;
        }
        ['checked', 'disabled', 'name', 'value', 'indeterminate'].forEach(p => upgradeProperty(this, p));
        initInput(this, this._input);
        this._input?.addEventListener('change', this._onChange);
        this._input?.addEventListener('click', this._onClick);
        syncFormValue(this, this._input, this._internals);
    }

    disconnectedCallback() {
        this._input?.removeEventListener('change', this._onChange);
        this._input?.removeEventListener('click', this._onClick);
    }

    formResetCallback() {
        this.indeterminate = this._defaultIndeterminate;
        this.checked = this._defaultChecked;
    }

    attributeChangedCallback(name: string, _oldVal: string | null, newVal: string | null) {
        applyAttribute(this, this._input, this._internals, name, newVal);
    }

    private _onChange = () => handleChange(this, this._input, this._internals);
    private _onClick = (e: Event) => handleClick(this, e);

    get checked() { return this.hasAttribute('checked'); }
    set checked(v: boolean) { v ? this.setAttribute('checked', '') : this.removeAttribute('checked'); }

    get disabled() { return this.hasAttribute('disabled'); }
    set disabled(v: boolean) { v ? this.setAttribute('disabled', '') : this.removeAttribute('disabled'); }

    get indeterminate() { return this._input?.indeterminate ?? this.hasAttribute('indeterminate'); }
    set indeterminate(v: boolean) {
        v ? this.setAttribute('indeterminate', '') : this.removeAttribute('indeterminate');
        if (this._input) this._input.indeterminate = v;
    }

    get name() { return this.getAttribute('name') ?? ''; }
    set name(v: string) { this.setAttribute('name', v); }

    get value() { return this.getAttribute('value') ?? 'on'; }
    set value(v: string) { this.setAttribute('value', v); }

    get form() { return this._internals.form; }

    override click() { this._input?.click(); }
}
