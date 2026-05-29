import { Component } from "@bernouy/cms-blocs/base";
import template from './template.html' with { type: 'text' };
import css from './style.css' with { type: 'text' };

import { upgradeProperty } from './compute';
import { updateFileValue } from './domain/value';
import { handleDragOver, handleDragLeave, handleDrop } from './listener';

export class InputFile extends Component {
    static formAssociated = true;
    private _internals: ElementInternals;
    private _input: HTMLInputElement | null;
    private _preview: HTMLElement | null;
    private _dropZone: HTMLElement | null;
    private _liveRegion: HTMLElement | null;

    constructor() {
        super({ css, template: template as unknown as string });
        this._internals = this.attachInternals();
        this._input = this.shadowRoot?.querySelector('input[type="file"]') ?? null;
        this._preview = this.shadowRoot?.querySelector('.file-info') ?? null;
        this._dropZone = this.shadowRoot?.querySelector('.drop-zone') ?? null;
        this._liveRegion = this.shadowRoot?.querySelector('.sr-live') ?? null;
    }

    static get observedAttributes() { return ['accept', 'multiple', 'name', 'disabled', 'required']; }

    override connectedCallback() {
        for (const prop of ['accept', 'multiple', 'name', 'disabled', 'required']) upgradeProperty(this, prop);
        this._input?.addEventListener('change', this._onChange);
        this._dropZone?.addEventListener('dragover', this._onDragOver);
        this._dropZone?.addEventListener('dragleave', this._onDragLeave);
        this._dropZone?.addEventListener('drop', this._onDrop);
    }

    disconnectedCallback() {
        this._input?.removeEventListener('change', this._onChange);
        this._dropZone?.removeEventListener('dragover', this._onDragOver);
        this._dropZone?.removeEventListener('dragleave', this._onDragLeave);
        this._dropZone?.removeEventListener('drop', this._onDrop);
    }

    formResetCallback() {
        if (this._input) this._input.value = '';
        this._internals.setFormValue(null);
        if (this._preview) this._preview.textContent = 'No file selected';
        this.removeAttribute('dragging');
    }

    attributeChangedCallback(name: string, _oldVal: string | null, newVal: string | null) {
        if (!this._input) return;
        switch (name) {
            case 'accept':
                if (newVal === null) this._input.removeAttribute('accept');
                else this._input.setAttribute('accept', newVal);
                break;
            case 'multiple': this._input.multiple = this.hasAttribute('multiple'); break;
            case 'name':
                if (newVal === null) this._input.removeAttribute('name');
                else this._input.setAttribute('name', newVal);
                break;
            case 'disabled': this._input.disabled = this.hasAttribute('disabled'); break;
            case 'required': this._input.required = this.hasAttribute('required'); break;
        }
    }

    private _onChange = () =>
        updateFileValue(this, this._input, this._preview, this._liveRegion, this._internals);
    private _onDragOver = (e: Event) => handleDragOver(this, e);
    private _onDragLeave = (e: Event) => handleDragLeave(this, e);
    private _onDrop = (e: Event) =>
        handleDrop(this, this._input, this._preview, this._liveRegion, this._internals, e);

    get name() { return this.getAttribute('name') ?? ''; }
    set name(v: string) { this.setAttribute('name', v); }

    get accept() { return this.getAttribute('accept') ?? ''; }
    set accept(v: string) { v ? this.setAttribute('accept', v) : this.removeAttribute('accept'); }

    get multiple() { return this.hasAttribute('multiple'); }
    set multiple(v: boolean) { v ? this.setAttribute('multiple', '') : this.removeAttribute('multiple'); }

    get disabled() { return this.hasAttribute('disabled'); }
    set disabled(v: boolean) { v ? this.setAttribute('disabled', '') : this.removeAttribute('disabled'); }

    get required() { return this.hasAttribute('required'); }
    set required(v: boolean) { v ? this.setAttribute('required', '') : this.removeAttribute('required'); }

    get files() { return this._input?.files ?? null; }
    get value() { return this._input?.files?.[0] ?? null; }
    get form() { return this._internals.form; }
}
