import { Component } from "@bernouy/cms-blocs/base";

import template from './template.html' with { type: 'text' };
import baseCss from './base.css' with { type: 'text' };
import variantCss from './variant.css' with { type: 'text' };
const css = baseCss + variantCss;

export class Alert extends Component {

    private _close: HTMLButtonElement | null;
    private _message: HTMLElement | null;
    private _messageSlot: HTMLSlotElement | null;

    static get observedAttributes() {
        return ['dismissible'];
    }

    constructor() {
        super({
            css,
            template: template as unknown as string,
        });
        this._close = this.shadowRoot?.querySelector('.close') ?? null;
        this._message = this.shadowRoot?.querySelector('.message') ?? null;
        this._messageSlot = this.shadowRoot?.querySelector('.message slot') ?? null;
    }

    override connectedCallback() {
        this._syncDismissible();
        this._close?.addEventListener('click', this._handleClose);
        this._messageSlot?.addEventListener('slotchange', this._syncMessage);
        this._syncMessage();
    }

    disconnectedCallback() {
        this._close?.removeEventListener('click', this._handleClose);
        this._messageSlot?.removeEventListener('slotchange', this._syncMessage);
    }

    /** Collapse the message area only when nothing is actually slotted. CSS
     *  `:empty` can't detect a `<slot>`'s content: a slot is `:empty` unless it
     *  has *fallback* children, regardless of assigned light-DOM — so it hid the
     *  message even when one was provided. Check the assigned nodes instead. */
    private _syncMessage = () => {
        if (!this._message || !this._messageSlot) return;
        const hasContent = this._messageSlot.assignedNodes({ flatten: true })
            .some(n => n.nodeType === Node.ELEMENT_NODE || (n.textContent ?? '').trim() !== '');
        this._message.classList.toggle('is-empty', !hasContent);
    };

    attributeChangedCallback(name: string, _oldVal: string | null, _newVal: string | null) {
        if (name === 'dismissible') this._syncDismissible();
    }

    private _syncDismissible() {
        if (!this._close) return;
        this._close.hidden = !this.hasAttribute('dismissible');
    }

    private _handleClose = () => {
        const cancelled = !this.dispatchEvent(new CustomEvent('dismiss', {
            bubbles: true,
            cancelable: true,
        }));
        if (cancelled) return;
        this.setAttribute('leaving', '');
        this.addEventListener('animationend', () => this.remove(), { once: true });
    };

    dismiss() {
        this._handleClose();
    }
}
