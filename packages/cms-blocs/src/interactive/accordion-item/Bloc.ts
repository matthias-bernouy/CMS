import template from './template.html' with { type: 'text' };
import css from './style.css' with { type: 'text' };
import { Component } from '@bernouy/cms/component';

export class Bloc extends Component {

    static observedAttributes = ['open'];

    private _header: HTMLButtonElement | null = null;

    constructor() {
        super({ css, template: template as unknown as string });
    }

    override connectedCallback(): void {
        this._header = this.shadowRoot?.querySelector('.header') ?? null;
        this._header?.addEventListener('click', this._onClick);
        this._syncAria();
    }

    disconnectedCallback(): void {
        this._header?.removeEventListener('click', this._onClick);
    }

    attributeChangedCallback(name: string) {
        if (name === 'open') this._syncAria();
    }

    private _syncAria() {
        this._header?.setAttribute('aria-expanded', this.hasAttribute('open') ? 'true' : 'false');
    }

    private _onClick = () => {
        if (this.hasAttribute('disabled')) return;
        const willOpen = !this.hasAttribute('open');
        if (willOpen) {
            this.setAttribute('open', '');
            this.dispatchEvent(new CustomEvent('accordion-item-open', { bubbles: true }));
        } else {
            this.removeAttribute('open');
        }
    };

}
