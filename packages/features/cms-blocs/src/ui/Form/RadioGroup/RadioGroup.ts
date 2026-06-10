import { Component } from "@bernouy/cms-blocs/base";

import template from './template.html' with { type: 'text' };
import css from './style.css' with { type: 'text' };

import {
    upgradeProperty, getRadios, applyValue, syncLabel, syncDisabled,
} from './compute';
import { syncRadios, handleRadioChange, handleKeydown } from './listener';

export class RadioGroup extends Component {

    static formAssociated = true;
    private _internals: ElementInternals;
    private _label: HTMLElement | null;
    private _slot: HTMLSlotElement | null;
    private _defaultValue: string | null = null;
    private _defaultsCaptured = false;

    static get observedAttributes() { return ['value', 'label', 'name', 'disabled']; }

    constructor() {
        super({ css, template: template as unknown as string });
        this._internals = this.attachInternals();
        this._label = this.shadowRoot?.querySelector('.label') ?? null;
        this._slot = this.shadowRoot?.querySelector('slot') ?? null;
    }

    override connectedCallback() {
        if (!this._defaultsCaptured) {
            this._defaultValue = this.getAttribute('value');
            this._defaultsCaptured = true;
        }

        for (const prop of ['value', 'name', 'disabled']) upgradeProperty(this, prop);

        this.setAttribute('role', 'radiogroup');
        syncLabel(this._label, this.getAttribute('label'));
        this._slot?.addEventListener('slotchange', this._onSlotChange);
        this.addEventListener('change', this._onChange);
        this.addEventListener('keydown', this._onKey);
        syncRadios(this, this._slot, this._internals);
    }

    disconnectedCallback() {
        this._slot?.removeEventListener('slotchange', this._onSlotChange);
        this.removeEventListener('change', this._onChange);
        this.removeEventListener('keydown', this._onKey);
    }

    formResetCallback() {
        if (this._defaultValue === null) this.removeAttribute('value');
        else this.setAttribute('value', this._defaultValue);
    }

    attributeChangedCallback(name: string, _oldVal: string | null, newVal: string | null) {
        if (name === 'value') applyValue(getRadios(this._slot), newVal, this._internals);
        else if (name === 'label') syncLabel(this._label, newVal);
        else if (name === 'disabled') syncDisabled(getRadios(this._slot), this.hasAttribute('disabled'));
    }

    get value(): string { return this.getAttribute('value') ?? ''; }
    set value(v: string) { this.setAttribute('value', v); }

    get name(): string { return this.getAttribute('name') ?? ''; }
    set name(v: string) { v ? this.setAttribute('name', v) : this.removeAttribute('name'); }

    get disabled(): boolean { return this.hasAttribute('disabled'); }
    set disabled(v: boolean) { v ? this.setAttribute('disabled', '') : this.removeAttribute('disabled'); }

    private _onSlotChange = () => syncRadios(this, this._slot, this._internals);
    private _onChange = (e: Event) => handleRadioChange(this, e);
    private _onKey = (e: KeyboardEvent) => handleKeydown(this, this._slot, e);
}
