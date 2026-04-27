import { Component } from "../../../base/Component";
import { handleBackdropClick, handleCancel, handleClose } from './listener';

import template from './template.html' with { type: 'text' };
import css from './style.css' with { type: 'text' };

export class Modal extends Component {

    private _dialog: HTMLDialogElement | null = null;
    private _onBackdrop = (e: MouseEvent) => handleBackdropClick(this, e);
    private _onCancel = (e: Event) => handleCancel(this, e);
    private _onClose = () => handleClose(this);

    static get observedAttributes() { return ['open', 'aria-label']; }

    constructor() {
        super({ css, template: template as unknown as string });
    }

    override connectedCallback() {
        this._dialog ??= this.shadowRoot?.querySelector('dialog') ?? null;
        this._upgradeProperty('open');
        this._dialog?.addEventListener('click', this._onBackdrop);
        this._dialog?.addEventListener('cancel', this._onCancel);
        this._dialog?.addEventListener('close', this._onClose);
        this.addEventListener("form:success", this.hide);
        this._syncLabel();
        this._syncOpen();
    }

    disconnectedCallback() {
        this._dialog?.removeEventListener('click', this._onBackdrop);
        this._dialog?.removeEventListener('cancel', this._onCancel);
        this._dialog?.removeEventListener('close', this._onClose);
        this.removeEventListener("form:success", this.hide);
    }

    attributeChangedCallback(name: string, _old: string | null, _new: string | null) {
        if (_old === _new || !this.isConnected) return;
        if (name === 'aria-label') this._syncLabel();
        else if (name === 'open') this._syncOpen();
    }

    private _syncLabel() {
        const label = this.getAttribute('aria-label');
        if (label) this._dialog?.setAttribute('aria-label', label);
        else this._dialog?.removeAttribute('aria-label');
    }

    private _syncOpen() {
        if (!this._dialog) return;
        const shouldOpen = this.hasAttribute('open');
        if (shouldOpen && !this._dialog.open) {
            this._dialog.showModal();
            this.dispatchEvent(new CustomEvent('open', { bubbles: true, composed: true }));
        } else if (!shouldOpen && this._dialog.open) {
            this._dialog.close();
        }
    }

    private _upgradeProperty(prop: string) {
        if (Object.prototype.hasOwnProperty.call(this, prop)) {
            const val = (this as unknown as Record<string, unknown>)[prop];
            delete (this as unknown as Record<string, unknown>)[prop];
            (this as unknown as Record<string, unknown>)[prop] = val;
        }
    }

    get open(): boolean { return this.hasAttribute('open'); }
    set open(v: boolean) { v ? this.setAttribute('open', '') : this.removeAttribute('open'); }

    show() { if (!this.hasAttribute('open')) this.setAttribute('open', ''); }
    showModal() { this.show(); }
    hide() { if (this.hasAttribute('open')) this.removeAttribute('open'); }
    toggle() { if (this.open) this.hide(); else this.show(); }
}

if (!customElements.get('p9r-modal')) {
    customElements.define('p9r-modal', Modal);
}
