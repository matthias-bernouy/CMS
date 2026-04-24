import { Component } from "../../../base/Component";

import template from './template.html' with { type: 'text' };
import css from './style.css' with { type: 'text' };

export class FormDialog extends Component {

    private _dialog: HTMLDialogElement | null;
    private _form: HTMLFormElement | null;
    private _previouslyFocused: Element | null = null;

    static get observedAttributes() {
        return ['action', 'method', 'enctype'];
    }

    constructor() {
        super({ css, template: template as unknown as string });
        this._dialog = this.shadowRoot?.querySelector('dialog') ?? null;
        this._form = this.shadowRoot?.querySelector('#form-validation') ?? null;
    }

    override connectedCallback() {
        for (const prop of ['action', 'method', 'enctype']) {
            this._upgradeProperty(prop);
        }

        this._dialog?.addEventListener('click', this._handleBackdropClick);
        this._dialog?.addEventListener('close', this._handleClose);
        this._form?.addEventListener('formdata', this._handleFormData);
    }

    disconnectedCallback() {
        this._dialog?.removeEventListener('click', this._handleBackdropClick);
        this._dialog?.removeEventListener('close', this._handleClose);
        this._form?.removeEventListener('formdata', this._handleFormData);
    }

    attributeChangedCallback(name: string, _oldVal: string | null, newVal: string | null) {
        if (!this._form) return;
        if (name === 'action')  this._form.action  = newVal ?? '';
        if (name === 'method')  this._form.method  = (newVal ?? 'get');
        if (name === 'enctype') this._form.enctype = (newVal ?? 'application/x-www-form-urlencoded');
    }

    private _handleBackdropClick = (event: MouseEvent) => {
        if (!this._dialog) return;
        if (event.target !== this._dialog) return;
        const rect = this._dialog.getBoundingClientRect();
        const isInDialog = (
            rect.top <= event.clientY &&
            event.clientY <= rect.top + rect.height &&
            rect.left <= event.clientX &&
            event.clientX <= rect.left + rect.width
        );
        if (!isInDialog) {
            this.close();
        }
    };

    private _handleClose = () => {
        if (this._previouslyFocused instanceof HTMLElement) {
            this._previouslyFocused.focus();
        }
        this._previouslyFocused = null;
        this.dispatchEvent(new CustomEvent('close', { bubbles: true, composed: true }));
    };

    private _handleFormData = (e: FormDataEvent) => {
        const slottedInputs = this.querySelectorAll<HTMLElement>('[name]');
        slottedInputs.forEach((el) => {
            const name = el.getAttribute('name');
            const value = (el as unknown as { value?: unknown }).value;
            if (name && value !== undefined && value !== null && value !== '') {
                e.formData.append(name, String(value));
            }
        });
    };

    private _upgradeProperty(prop: string) {
        if (Object.prototype.hasOwnProperty.call(this, prop)) {
            const value = (this as any)[prop];
            delete (this as any)[prop];
            (this as any)[prop] = value;
        }
    }

    showModal() {
        if (!this._dialog) return;
        this._previouslyFocused = document.activeElement;
        this._dialog.showModal();
        this.dispatchEvent(new CustomEvent('open', { bubbles: true, composed: true }));
    }

    close() {
        this._dialog?.close();
    }

    get action() {
        return this.getAttribute('action') ?? '';
    }

    set action(val: string) {
        if (val) this.setAttribute('action', val);
        else this.removeAttribute('action');
    }

    get method() {
        return this.getAttribute('method') ?? 'get';
    }

    set method(val: string) {
        if (val) this.setAttribute('method', val);
        else this.removeAttribute('method');
    }

    get enctype() {
        return this.getAttribute('enctype') ?? 'application/x-www-form-urlencoded';
    }

    set enctype(val: string) {
        if (val) this.setAttribute('enctype', val);
        else this.removeAttribute('enctype');
    }
}

if (!customElements.get('p9r-form-dialog')) {
    customElements.define('p9r-form-dialog', FormDialog);
}
