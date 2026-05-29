import { Component } from "@bernouy/cms-blocs/base";

import template from './template.html' with { type: 'text' };
import baseCss from './base.css' with { type: 'text' };
import variantCss from './variant.css' with { type: 'text' };
const css = baseCss + variantCss;

export class Alert extends Component {

    private _close: HTMLButtonElement | null;

    static get observedAttributes() {
        return ['dismissible'];
    }

    constructor() {
        super({
            css,
            template: template as unknown as string,
        });
        this._close = this.shadowRoot?.querySelector('.close') ?? null;
    }

    override connectedCallback() {
        this._syncDismissible();
        this._close?.addEventListener('click', this._handleClose);
    }

    disconnectedCallback() {
        this._close?.removeEventListener('click', this._handleClose);
    }

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
