import { Component } from "@bernouy/components/base";
import template from './template.html' with { type: 'text' };
import css from './style.css' with { type: 'text' };

import {
    upgradeProperty, getOptions, updateLabel, updateSliderPosition, updateSlottedSelections,
} from './compute';
import { syncOptions, handleKeydown } from './listener';

export class SegmentedSwitch extends Component {
    static formAssociated = true;
    private _internals: ElementInternals;
    private _labelEl: HTMLElement | null;
    private _slot: HTMLSlotElement | null;
    private _defaultValue: string = '';
    private _defaultsCaptured = false;
    private _silentValueChange = false;

    static get observedAttributes() { return ['value', 'disabled', 'name', 'label']; }

    constructor() {
        super({ css, template: template as unknown as string });
        this._internals = this.attachInternals();
        this._labelEl = this.shadowRoot?.querySelector('.label') ?? null;
        this._slot = this.shadowRoot?.querySelector('slot:not([name])') ?? null;
    }

    override connectedCallback() {
        if (!this._defaultsCaptured) {
            this._defaultValue = this.getAttribute('value') ?? '';
            this._defaultsCaptured = true;
        }

        for (const prop of ['value', 'disabled', 'name', 'label']) upgradeProperty(this, prop);

        if (this._slot) {
            this._slot.addEventListener('slotchange', this._onSlotChange);
            syncOptions(this, this._slot);
        }
        this.addEventListener('keydown', this._onKey);
        updateLabel(this._labelEl, this.getAttribute('label') ?? '');
    }

    disconnectedCallback() {
        this._slot?.removeEventListener('slotchange', this._onSlotChange);
        this.removeEventListener('keydown', this._onKey);
    }

    formResetCallback() {
        this._silentValueChange = true;
        try { this.value = this._defaultValue; }
        finally { this._silentValueChange = false; }
    }

    attributeChangedCallback(name: string, _oldVal: string | null, newVal: string | null) {
        if (!this.shadowRoot) return;
        if (name === 'value') this.value = newVal ?? '';
        else if (name === 'label') updateLabel(this._labelEl, newVal ?? '');
    }

    get value() { return this.getAttribute('value') ?? ''; }
    set value(v: string) {
        if (this.getAttribute('value') !== v) this.setAttribute('value', v);
        this._internals.setFormValue(v);
        const options = getOptions(this._slot);
        updateSliderPosition(this, options, v);
        updateSlottedSelections(options, v);
        if (!this._silentValueChange) {
            this.dispatchEvent(new CustomEvent('change', { bubbles: true, detail: { value: v } }));
        }
    }

    get name() { return this.getAttribute('name') ?? ''; }
    set name(v: string) { v ? this.setAttribute('name', v) : this.removeAttribute('name'); }

    get disabled() { return this.hasAttribute('disabled'); }
    set disabled(v: boolean) { v ? this.setAttribute('disabled', '') : this.removeAttribute('disabled'); }

    get label() { return this.getAttribute('label') ?? ''; }
    set label(v: string) { v ? this.setAttribute('label', v) : this.removeAttribute('label'); }

    private _onSlotChange = () => syncOptions(this, this._slot);
    private _onKey = (e: KeyboardEvent) => handleKeydown(this, this._slot, e);
}
