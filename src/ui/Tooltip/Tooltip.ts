import { Component } from "../../base/Component";

import template from './template.html' with { type: 'text' };
import css from './style.css' with { type: 'text' };

export class Tooltip extends Component {

    private _tooltip: HTMLElement | null;
    private _text: HTMLElement | null;
    private _showTimer: ReturnType<typeof setTimeout> | null = null;
    private _hideTimer: ReturnType<typeof setTimeout> | null = null;

    static get observedAttributes() {
        return ['text'];
    }

    constructor() {
        super({
            css,
            template: template as unknown as string,
        });
        this._tooltip = this.shadowRoot?.querySelector('.tooltip') ?? null;
        this._text = this.shadowRoot?.querySelector('.text') ?? null;
    }

    override connectedCallback() {
        this._syncText();
        this.addEventListener('mouseenter', this._show);
        this.addEventListener('mouseleave', this._hide);
        this.addEventListener('focusin', this._show);
        this.addEventListener('focusout', this._hide);
    }

    disconnectedCallback() {
        this.removeEventListener('mouseenter', this._show);
        this.removeEventListener('mouseleave', this._hide);
        this.removeEventListener('focusin', this._show);
        this.removeEventListener('focusout', this._hide);
        if (this._showTimer) clearTimeout(this._showTimer);
        if (this._hideTimer) clearTimeout(this._hideTimer);
    }

    attributeChangedCallback(name: string, _oldVal: string | null, _newVal: string | null) {
        if (name === 'text') this._syncText();
    }

    private _syncText() {
        if (this._text) this._text.textContent = this.getAttribute('text') ?? '';
    }

    private _show = () => {
        if (this._hideTimer) { clearTimeout(this._hideTimer); this._hideTimer = null; }
        const delay = Number(this.getAttribute('delay') ?? 100);
        this._showTimer = setTimeout(() => {
            this.setAttribute('open', '');
            this._tooltip?.setAttribute('aria-hidden', 'false');
        }, delay);
    };

    private _hide = () => {
        if (this._showTimer) { clearTimeout(this._showTimer); this._showTimer = null; }
        this._hideTimer = setTimeout(() => {
            this.removeAttribute('open');
            this._tooltip?.setAttribute('aria-hidden', 'true');
        }, 80);
    };
}

if (!customElements.get("p9r-tooltip")) {
    customElements.define("p9r-tooltip", Tooltip);
}
