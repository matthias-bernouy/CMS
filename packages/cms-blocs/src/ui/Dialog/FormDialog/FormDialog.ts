import { Component } from "@bernouy/cms-blocs/base";

import template from './template.html' with { type: 'text' };
import baseCss from './base.css' with { type: 'text' };
import variantCss from './variant.css' with { type: 'text' };
const css = baseCss + variantCss;

import { upgradeProperty } from './compute';
import { emitOpen, emitClose } from './emit';
import { handleBackdropClick, handleFormData } from './listener';

export class FormDialog extends Component {

    private _dialog: HTMLDialogElement | null;
    private _form: HTMLFormElement | null;
    private _previouslyFocused: Element | null = null;

    static get observedAttributes() { return ['action', 'method', 'enctype']; }

    constructor() {
        super({ css, template: template as unknown as string });
        this._dialog = this.shadowRoot?.querySelector('dialog') ?? null;
        this._form = this.shadowRoot?.querySelector('#form-validation') ?? null;
    }

    override connectedCallback() {
        for (const prop of ['action', 'method', 'enctype']) upgradeProperty(this, prop);
        this._dialog?.addEventListener('click', this._onBackdrop);
        this._dialog?.addEventListener('close', this._onClose);
        this._form?.addEventListener('formdata', this._onFormData);
    }

    disconnectedCallback() {
        this._dialog?.removeEventListener('click', this._onBackdrop);
        this._dialog?.removeEventListener('close', this._onClose);
        this._form?.removeEventListener('formdata', this._onFormData);
    }

    attributeChangedCallback(name: string, _oldVal: string | null, newVal: string | null) {
        if (!this._form) return;
        if (name === 'action')  this._form.action  = newVal ?? '';
        if (name === 'method')  this._form.method  = (newVal ?? 'get');
        if (name === 'enctype') this._form.enctype = (newVal ?? 'application/x-www-form-urlencoded');
    }

    private _onBackdrop = (e: MouseEvent) => handleBackdropClick(this, e);
    private _onFormData = (e: FormDataEvent) => handleFormData(this, e);
    private _onClose = () => {
        if (this._previouslyFocused instanceof HTMLElement) this._previouslyFocused.focus();
        this._previouslyFocused = null;
        emitClose(this);
    };

    showModal() {
        if (!this._dialog) return;
        this._previouslyFocused = document.activeElement;
        this._dialog.showModal();
        emitOpen(this);
    }

    close() { this._dialog?.close(); }

    get action() { return this.getAttribute('action') ?? ''; }
    set action(v: string) { v ? this.setAttribute('action', v) : this.removeAttribute('action'); }

    get method() { return this.getAttribute('method') ?? 'get'; }
    set method(v: string) { v ? this.setAttribute('method', v) : this.removeAttribute('method'); }

    get enctype() { return this.getAttribute('enctype') ?? 'application/x-www-form-urlencoded'; }
    set enctype(v: string) { v ? this.setAttribute('enctype', v) : this.removeAttribute('enctype'); }
}
