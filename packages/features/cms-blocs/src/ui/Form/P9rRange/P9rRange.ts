import { Component } from "@bernouy/cms-blocs/base";
import template from './ui/template.html' with { type: 'text' };
import baseCss from './ui/styles/base.css' with { type: 'text' };
import variantCss from './ui/styles/variant.css' with { type: 'text' };
import responsiveCss from './ui/styles/responsive.css' with { type: 'text' };
import { upgradeProperty } from './compute';
import { syncBounds, syncLabel, syncUnit, syncDisabled, syncValue } from './sync';
import { onSliderInput, onSliderChange, onNumberInput, onNumberChange, onNumberBlur } from './listener';

const css = baseCss + variantCss + responsiveCss;

export class P9rRange extends Component {
    static formAssociated = true;
    static get observedAttributes() { return ['value', 'label', 'min', 'max', 'step', 'unit', 'disabled']; }

    private _internals: ElementInternals;
    private _slider: HTMLInputElement | null;
    private _input: HTMLInputElement | null;
    private _fill: HTMLElement | null;
    private _labelEl: HTMLElement | null;
    private _unitEl: HTMLElement | null;
    private _minEl: HTMLElement | null;
    private _maxEl: HTMLElement | null;
    private _defaultValue = '';
    private _defaultsCaptured = false;

    constructor() {
        super({ css, template: template as unknown as string });
        this._internals = this.attachInternals();
        const r = this.shadowRoot!;
        this._slider = r.querySelector('.slider');
        this._input = r.querySelector('.number');
        this._fill = r.querySelector('.fill');
        this._labelEl = r.querySelector('.label');
        this._unitEl = r.querySelector('.unit');
        this._minEl = r.querySelector('.min-bound');
        this._maxEl = r.querySelector('.max-bound');
    }

    override connectedCallback() {
        ['value', 'disabled'].forEach(p => upgradeProperty(this, p));
        syncLabel(this, this._labelEl, this._slider, this._input);
        syncBounds(this, this._slider, this._input, this._minEl, this._maxEl);
        syncUnit(this, this._unitEl);
        syncDisabled(this, this._slider, this._input);
        const initial = this.getAttribute('value') ?? this.getAttribute('min') ?? '0';
        if (!this._defaultsCaptured) { this._defaultValue = initial; this._defaultsCaptured = true; }
        syncValue(this._slider, this._input, this._fill, this._internals, initial);
        this._wire('addEventListener');
    }

    disconnectedCallback() { this._wire('removeEventListener'); }

    formResetCallback() {
        syncValue(this._slider, this._input, this._fill, this._internals, this._defaultValue);
    }

    attributeChangedCallback(name: string, _oldVal: string | null, newVal: string | null) {
        if (!this._slider || !this._input) return;
        if (name === 'value' && newVal !== null) syncValue(this._slider, this._input, this._fill, this._internals, newVal);
        else if (name === 'label') syncLabel(this, this._labelEl, this._slider, this._input);
        else if (name === 'min' || name === 'max' || name === 'step') syncBounds(this, this._slider, this._input, this._minEl, this._maxEl);
        else if (name === 'unit') syncUnit(this, this._unitEl);
        else if (name === 'disabled') syncDisabled(this, this._slider, this._input);
    }

    get value() { return this._slider?.value ?? ''; }
    set value(v: string) { syncValue(this._slider, this._input, this._fill, this._internals, String(v)); }
    get name() { return this.getAttribute('name') ?? ''; }
    get disabled() { return this.hasAttribute('disabled'); }
    set disabled(v: boolean) { v ? this.setAttribute('disabled', '') : this.removeAttribute('disabled'); }

    override focus() { this._slider?.focus(); }

    private _wire(action: 'addEventListener' | 'removeEventListener') {
        this._slider?.[action]('input', this._onSliderInput);
        this._slider?.[action]('change', this._onSliderChange);
        this._input?.[action]('input', this._onNumberInput);
        this._input?.[action]('change', this._onNumberChange);
        this._input?.[action]('blur', this._onNumberBlur);
    }

    private _onSliderInput = () => onSliderInput(this, this._slider, this._input, this._fill, this._internals);
    private _onSliderChange = () => onSliderChange(this, this._slider, this._internals);
    private _onNumberInput = () => onNumberInput(this, this._slider, this._input, this._fill, this._internals);
    private _onNumberChange = () => onNumberChange(this, this._slider, this._input, this._fill, this._internals);
    private _onNumberBlur = () => onNumberBlur(this._slider, this._input);
}
