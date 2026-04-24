import { Component } from "../../../base/Component";

import template from './template.html' with { type: 'text' };
import css from './style.css' with { type: 'text' };

export class LateralDialog extends Component {

    private _dialog: HTMLDialogElement | null;
    private _closeBtn: HTMLButtonElement | null;

    static get observedAttributes() {
        return ['open'];
    }

    constructor() {
        super({
            css,
            template: template as unknown as string
        });

        this._dialog = this.shadowRoot?.querySelector("dialog") ?? null;
        this._closeBtn = this.shadowRoot?.querySelector("#close-btn") ?? null;
    }

    override connectedCallback() {
        this._upgradeProperty('open');

        this._dialog?.addEventListener('click', this._handleBackdropClick);
        this._dialog?.addEventListener('cancel', this._handleCancel);
        this._dialog?.addEventListener('close', this._handleClose);
        this._closeBtn?.addEventListener('click', this._handleCloseClick);
    }

    disconnectedCallback() {
        this._dialog?.removeEventListener('click', this._handleBackdropClick);
        this._dialog?.removeEventListener('cancel', this._handleCancel);
        this._dialog?.removeEventListener('close', this._handleClose);
        this._closeBtn?.removeEventListener('click', this._handleCloseClick);
    }

    attributeChangedCallback(name: string, _oldVal: string | null, _newVal: string | null) {
        if (!this._dialog) return;
        if (name === 'open') {
            const shouldOpen = this.hasAttribute('open');
            if (shouldOpen && !this._dialog.open) this._dialog.showModal();
            else if (!shouldOpen && this._dialog.open) this._dialog.close();
        }
    }

    private _handleBackdropClick = (event: MouseEvent) => {
        if (event.target === this._dialog) {
            this.close();
        }
    };

    private _handleCloseClick = (event: Event) => {
        event.preventDefault();
        this.close();
    };

    private _handleCancel = (event: Event) => {
        event.preventDefault();
        this.close();
    };

    private _handleClose = () => {
        if (this.hasAttribute('open')) this.removeAttribute('open');
        this.dispatchEvent(new CustomEvent('close', { bubbles: true, composed: true }));
    };

    private _upgradeProperty(prop: string) {
        if (Object.prototype.hasOwnProperty.call(this, prop)) {
            const value = (this as any)[prop];
            delete (this as any)[prop];
            (this as any)[prop] = value;
        }
    }

    get open(): boolean {
        return this.hasAttribute('open');
    }

    set open(val: boolean) {
        if (val) this.setAttribute('open', '');
        else this.removeAttribute('open');
    }

    show() {
        if (!this._dialog) return;
        if (!this._dialog.open) this._dialog.showModal();
        if (!this.hasAttribute('open')) this.setAttribute('open', '');
        this.dispatchEvent(new CustomEvent('open', { bubbles: true, composed: true }));
    }

    showModal() {
        this.show();
    }

    close() {
        if (!this._dialog) return;
        if (this._dialog.open) this._dialog.close();
    }
}

if (!customElements.get("w13c-lateral-dialog")) {
    customElements.define("w13c-lateral-dialog", LateralDialog);
}
